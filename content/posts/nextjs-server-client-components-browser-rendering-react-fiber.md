---
title: "深入理解 Next.js 服务端/客户端组件、浏览器渲染机制与 React Fiber 架构"
date: "2026-02-11"
excerpt: "从 Next.js 服务端组件与客户端组件的数据获取方式，到 BOM/DOM 存储 API，再到浏览器完整渲染流程和 React Fiber 架构的深度解析。"
tags: ["Next.js", "React", "浏览器渲染", "Fiber", "前端基础"]
---

# 深入理解 Next.js 服务端/客户端组件、浏览器渲染机制与 React Fiber 架构

本文整理自一次深度技术讨论，涵盖了 Next.js 数据获取模式、BOM/DOM 基础、浏览器渲染全流程以及 React Fiber 架构等核心前端知识。

---

## 一、Next.js 服务端组件与客户端组件的数据获取

### 1.1 服务端组件可以直接 async/await 吗？

```tsx
export default async function Page() {
  const data = await fetch('/api/list');
  return <div>{data}</div>;
}
```

**可以，但有两个问题需要注意：**

1. **`fetch` 返回的是 `Response` 对象**，不能直接渲染。需要先解析：

```tsx
export default async function Page() {
  const res = await fetch('http://localhost:3000/api/list');
  const data = await res.json();
  return <div>{JSON.stringify(data)}</div>;
}
```

2. **URL 必须是绝对路径**。服务端组件在 Node.js 环境执行，没有浏览器的 `origin`，所以 `fetch('/api/list')` 会失败。必须写成 `fetch('http://localhost:3000/api/list')` 或使用环境变量拼接完整 URL。

> 不过实际开发中，服务端组件更推荐直接调用数据库或内部函数，而不是通过 HTTP 请求自己的 API Route。

### 1.2 客户端组件可以用 async 吗？

```tsx
'use client';

export default async function Page() {
  const data = await fetch('/api/list');
  return <div>{data}</div>;
}
```

**不可以。** 客户端组件（带 `'use client'`）**不支持 `async` 函数组件**。React 在浏览器端渲染时，组件函数必须**同步返回** JSX。如果你把组件声明为 `async`，React 不知道如何处理返回的 Promise，会直接报错。

### 1.3 在 JSX 里调用异步函数呢？

```tsx
export default function Page() {
  const data = async function() {
    return await fetch('/api/list');
  }
  return <div>{data()}</div>;
}
```

**也不行。** `data()` 返回的是一个 `Promise` 对象，Promise 不是合法的 React 子元素，React 无法渲染它。

### 1.4 在 JSX 里 await 呢？

```tsx
'use client';
export default function Page() {
  const data = async function() {
    return await fetch('/api/list');
  }
  return <div>{await data()}</div>;
}
```

**也不行。** JSX 表达式 `{}` 里面不能使用 `await`，因为 `await` 只能出现在 `async` 函数体内。即使把整个组件声明为 `async`，客户端组件也不支持这种写法。

### 1.5 客户端组件的正确做法

客户端组件获取数据应该使用 **`useEffect` + `useState`** 或者 **SWR / React Query** 等数据请求库：

```tsx
'use client';
import { useState, useEffect } from 'react';

export default function Page() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/list')
      .then(res => res.json())
      .then(setData);
  }, []);

  if (!data) return <div>Loading...</div>;
  return <div>{JSON.stringify(data)}</div>;
}
```

或者使用 SWR：

```tsx
'use client';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function Page() {
  const { data, isLoading } = useSWR('/api/list', fetcher);

  if (isLoading) return <div>Loading...</div>;
  return <div>{JSON.stringify(data)}</div>;
}
```

### 1.6 服务端组件为什么可以直接 async/await？

服务端组件（Server Component）能直接使用 `async/await`，是因为它们**只在服务器端执行**，React 的服务端渲染运行时支持异步组件。具体流程：

1. **服务端执行**：Node.js 运行时遇到 `async` 组件，会 `await` 等待所有异步操作完成
2. **数据请求完成**：所有的 `fetch`、数据库查询、文件读取等操作都在服务器完成
3. **生成 RSC Payload**：将组件渲染结果序列化为 React Server Component Payload（一种特殊的流式数据格式）
4. **发送到浏览器**：浏览器接收到的是已经"跑完"的渲染结果，不需要再执行任何异步逻辑

**关键点**：这些数据请求（接口调用、数据库查询、文件读取、权限校验等）**只在服务器端执行**，浏览器端拿不到这些代码，也看不到这些请求。浏览器最终拿到的只是渲染好的 HTML 和 RSC Payload。

---

## 二、浏览器能看到 API 请求吗？

### 2.1 服务端组件中的 fetch

如果在 **服务端组件** 中使用 `fetch`：

```tsx
// 服务端组件（无 'use client'）
export default async function Page() {
  const res = await fetch('http://localhost:3000/api/list');
  const data = await res.json();
  return <div>{data.title}</div>;
}
```

浏览器的 DevTools Network 面板**看不到**这个 `/api/list` 请求，因为它是在服务器上（Node.js 进程中）发起的 HTTP 请求，跟浏览器没有任何关系。

### 2.2 客户端组件中的 fetch（SWR 等）

如果在**客户端组件**中使用 SWR 或 fetch：

```tsx
'use client';

export function useBookDetail(id: string | null) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<BookDetail>(
    id ? `/api/library/detail?id=${id}` : null,
    fetcher
  );
  return { book: data, isLoading, isValidating, error, mutate };
}
```

对应的 API Route：

```tsx
// app/api/library/detail/route.ts
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  const book = await prisma.book.findUnique({ where: { id } });
  // ...
  return success(payload);
}
```

浏览器的 Network 面板**可以看到**这个 `/api/library/detail?id=xxx` 请求。因为：

- SWR / fetch 运行在**浏览器端**
- 由浏览器发起真实的 HTTP 请求到 Next.js 服务器
- 服务器接收请求 → 执行 API Route 逻辑（查数据库等）→ 返回 JSON 响应
- 浏览器拿到响应数据，更新 UI

**总结**：

| 场景 | 请求发起位置 | 浏览器 Network 可见？ |
|------|-------------|---------------------|
| 服务端组件 fetch | Node.js 服务器 | 不可见 |
| 客户端 SWR/fetch | 浏览器 | 可见 |
| API Route 内部的数据库调用 | Node.js 服务器 | 不可见（只有触发它的请求可见） |

---

## 三、BOM 与 DOM

### 3.1 什么是 BOM 和 DOM？

**DOM（Document Object Model，文档对象模型）** 是 HTML 文档的编程接口，把文档解析为一棵节点树：

```
document
└── html
    ├── head
    │   ├── title
    │   └── meta
    └── body
        ├── div#app
        ├── p
        └── ...
```

**BOM（Browser Object Model，浏览器对象模型）** 是浏览器提供的与文档内容无关的对象，核心是 `window` 对象：

```
window
├── document     (DOM 入口)
├── location     (URL 信息)
├── navigator    (浏览器信息)
├── history      (浏览历史)
├── screen       (屏幕信息)
├── localStorage (本地存储)
├── sessionStorage
├── console
├── setTimeout / setInterval
├── fetch / XMLHttpRequest
└── ...
```

### 3.2 DOM 的常见应用

- **操作页面元素**：增删改查节点、修改文本内容、修改样式
- **事件处理**：`addEventListener` 绑定点击、输入、滚动等事件
- **表单操作**：读写表单值、表单验证
- **动画效果**：修改样式 + `requestAnimationFrame`
- **虚拟 DOM**：React/Vue 等框架的核心机制

### 3.3 BOM 的常见应用

- **路由管理**：`location.href`、`history.pushState`（SPA 路由的基础）
- **浏览器信息检测**：`navigator.userAgent`、`navigator.language`
- **定时器**：`setTimeout`、`setInterval`、`requestAnimationFrame`
- **网络请求**：`fetch`、`XMLHttpRequest`
- **页面通信**：`postMessage`（跨窗口/iframe 通信）
- **存储数据**：这是 BOM 最重要的用途之一

### 3.4 浏览器存储 API

BOM 提供了多种存储方案，全部挂载在 `window` 对象上：

| 存储方式 | 容量 | 生命周期 | 随请求发送 | 访问方式 |
|---------|------|---------|-----------|---------|
| `localStorage` | ~5-10MB | 永久（手动清除） | 否 | `window.localStorage` |
| `sessionStorage` | ~5MB | 标签页关闭即清除 | 否 | `window.sessionStorage` |
| `cookie` | ~4KB | 可设置过期时间 | 是（每次 HTTP 请求自动携带） | `document.cookie` |
| `IndexedDB` | 很大（数百 MB+） | 永久 | 否 | `window.indexedDB` |
| `Cache API` | 很大 | 手动管理 | 否 | `window.caches` |

**它们确实都是挂载在 `window` 上的**，严格来说属于 BOM 的一部分。其中 `cookie` 比较特殊：

- 访问方式是 `document.cookie`（挂在 DOM 的 `document` 上）
- 但它的行为（随 HTTP 请求发送、由服务端设置）更偏向 BOM/网络层
- 所以 `cookie` 是 BOM 和 DOM 的交叉地带

---

## 四、浏览器渲染全流程：从输入 URL 到页面显示

### 4.1 网络阶段

#### 步骤 1：URL 解析

用户在地址栏输入 URL 后，浏览器首先判断这是搜索关键词还是 URL。如果是 URL，补全协议（默认 `https://`）。

#### 步骤 2：DNS 解析

将域名解析为 IP 地址，查找顺序：

```
浏览器 DNS 缓存 → 操作系统 DNS 缓存 → hosts 文件
  → 路由器缓存 → ISP DNS 服务器 → 根 DNS → 顶级域 DNS → 权威 DNS
```

优化手段：`dns-prefetch`：

```html
<link rel="dns-prefetch" href="//api.example.com">
```

#### 步骤 3：TCP 连接（三次握手）

```
客户端 → SYN → 服务器
客户端 ← SYN+ACK ← 服务器
客户端 → ACK → 服务器
```

如果是 HTTPS，还需要 TLS 握手（协商加密算法、交换密钥）。

#### 步骤 4：发送 HTTP 请求

浏览器构造请求报文（方法、路径、Headers、Cookie 等），发送给服务器。

#### 步骤 5：服务器处理并返回响应

服务器处理请求、返回 HTML 文档。响应头中包含 `Content-Type`、缓存策略（`Cache-Control`）、状态码等。

#### 步骤 6：TCP 断开（四次挥手）

```
客户端 → FIN → 服务器
客户端 ← ACK ← 服务器
客户端 ← FIN ← 服务器
客户端 → ACK → 服务器
```

> 现代 HTTP/1.1 默认 `keep-alive`，不会每次请求都断开连接；HTTP/2 还支持多路复用。

### 4.2 解析阶段

#### 步骤 7：HTML 解析 → DOM 树

浏览器收到 HTML 字节流后，进行如下处理：

```
字节 (Bytes)  →  字符 (Characters)  →  令牌 (Tokens)  →  节点 (Nodes)  →  DOM 树
```

解析是**增量的、流式的**——不需要等到整个 HTML 下载完才开始，边下载边解析。

#### 步骤 8：CSS 解析 → CSSOM 树

遇到 `<link>` 或 `<style>` 标签时，解析 CSS：

```
CSS 字节  →  字符  →  Tokens  →  CSS Rules  →  CSSOM 树
```

CSSOM 包含所有样式信息（包括继承、层叠计算等）。

#### 步骤 9：JavaScript 执行

遇到 `<script>` 标签时，默认行为是**阻塞 HTML 解析**：

```html
<!-- 阻塞式：暂停 HTML 解析，下载并执行 JS -->
<script src="app.js"></script>

<!-- defer：不阻塞 HTML 解析，HTML 解析完成后、DOMContentLoaded 前执行 -->
<script defer src="app.js"></script>

<!-- async：不阻塞 HTML 解析，下载完后立即执行（可能在 HTML 解析过程中） -->
<script async src="app.js"></script>
```

### 4.3 JS 阻塞与 CSS 阻塞的细节

**JS 阻塞 DOM 解析：**

- 普通 `<script>` 会**阻塞 HTML 的解析**（即 DOM 构建暂停）
- JS 可以读写 DOM（`document.getElementById` 等），所以浏览器必须等 JS 执行完才能继续解析 HTML
- 阻塞的是 HTML 解析（DOM 构建），而不是 CSS 解析

**CSS 阻塞渲染但不阻塞 HTML 解析：**

- CSS **不会阻塞 HTML 解析**。浏览器遇到 `<link rel="stylesheet">` 后，会异步下载 CSS，同时继续解析 HTML
- CSS **会阻塞渲染**。浏览器需要 CSSOM 才能构建 Render Tree，所以 CSS 没下载/解析完之前不会渲染页面
- CSS **会阻塞 JS 执行**。如果 `<script>` 在 `<link>` 之后，浏览器会等 CSS 下载解析完才执行 JS（因为 JS 可能读取样式信息）

**时序图示：**

```
HTML: ──解析──▌暂停▐──继续解析──→ DOM 树完成
                ↑
            遇到 <script>
            等 JS 下载+执行

CSS:  ──异步下载+解析──────────→ CSSOM 完成
      （不阻塞 HTML 解析）
      （但阻塞渲染 & 阻塞 JS 执行）
```

### 4.4 渲染阶段

#### 步骤 10：构建 Render Tree（渲染树）

DOM 树 + CSSOM 树 → Render Tree：

- 只包含**可见节点**（`display: none` 的元素不在渲染树中）
- 每个节点附带计算后的样式信息
- `visibility: hidden` 的元素**在**渲染树中（只是不可见，仍占布局空间）

#### 步骤 11：Layout（布局 / 回流 / Reflow）

计算每个节点的**精确位置和大小**：

- 从根节点开始，递归计算
- 处理百分比、em、auto 等相对值
- 计算盒模型（content、padding、border、margin）

#### 步骤 12：Paint（绘制）

将渲染树的节点转换为**绘制指令**：

- 文本绘制
- 颜色填充
- 边框、阴影
- 图片解码绘制

#### 步骤 13：Compositing（合成）

现代浏览器将页面分为多个图层（Layer），分别绘制后通过 GPU 合成最终画面：

- `transform`、`opacity`、`will-change` 等属性会创建独立的合成层
- 合成操作由 GPU 执行，性能非常高
- 这就是为什么 CSS 动画推荐用 `transform` 而非 `top/left`

**完整流程总览：**

```
URL → DNS → TCP → HTTP 请求/响应 → HTML 解析
                                       ↓
                              DOM 树  +  CSSOM 树
                                       ↓
                                   Render Tree
                                       ↓
                                  Layout（布局）
                                       ↓
                                  Paint（绘制）
                                       ↓
                                Composite（合成）
                                       ↓
                                   像素显示
```

---

## 五、React 项目的渲染全流程

### 5.1 与普通网页的对比

普通多页面网站（MPA）：

```
服务器返回完整 HTML → 浏览器解析渲染 → 用户看到页面
                                       ↓
                          点击链接 → 整个页面刷新
```

React 单页应用（SPA）：

```
服务器返回几乎空的 HTML（只有 <div id="root">）
  → 下载 JS bundle（React + 你的代码）
  → 执行 JS
  → React 创建虚拟 DOM → 真实 DOM
  → 浏览器渲染像素
```

**关键区别**：

1. **首次加载更慢**：需要下载并执行大量 JS 才能看到内容（白屏时间更长）
2. **后续交互更快**：页面跳转不需要重新请求 HTML，JS 在内存中操作 DOM
3. **SEO 不友好**：搜索引擎爬虫可能看不到 JS 渲染的内容（所以有了 SSR/SSG）

### 5.2 React 在浏览器渲染管线中的位置

React 框架工作在浏览器渲染管线的 **JS 执行层**，位于 DOM 操作之上：

```
┌────────────────────────────────────────────┐
│               用户应用层                     │
│  (你写的组件、状态、业务逻辑)                  │
├────────────────────────────────────────────┤
│            React 框架层                      │  ← React 在这里
│  Fiber 架构 / 虚拟 DOM / Diff / 调度器        │
│  将组件树的变更计算出最小 DOM 操作              │
├────────────────────────────────────────────┤
│            DOM API 层                        │
│  document.createElement / appendChild /      │
│  setAttribute / removeChild 等               │
├────────────────────────────────────────────┤
│           浏览器渲染引擎层                    │
│  DOM 树 + CSSOM → Render Tree               │
│  → Layout → Paint → Composite               │
├────────────────────────────────────────────┤
│              GPU / 显示层                     │
│  合成图层 → 帧缓冲区 → 屏幕显示               │
└────────────────────────────────────────────┘
```

**React 并不替代浏览器的渲染引擎**，它只是一个运行在 JS 层的库：

- React 计算出"哪些 DOM 需要变更"
- 通过标准 DOM API 操作真实 DOM
- 浏览器渲染引擎接管后续的 Layout → Paint → Composite

**Vue、Angular 等框架的定位完全相同**——都在 JS 执行层，只是内部实现策略不同（Vue 用响应式 Proxy，Angular 用脏检查+Zone.js）。

---

## 六、React 渲染机制深度解析

### 6.1 首次渲染（Initial Render / Mount）

```tsx
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
```

**过程**：

1. **创建 Fiber 树**：从 `<App />` 开始，递归遍历所有组件，为每个组件/DOM 元素创建 Fiber 节点
2. **执行组件函数**：调用函数组件（或 class 组件的 render），获取返回的 JSX
3. **创建真实 DOM**：遍历完成后，根据 Fiber 树批量创建真实 DOM 节点
4. **挂载到容器**：将完整的 DOM 树一次性挂载到 `#root` 容器
5. **执行副作用**：运行 `useEffect`、`useLayoutEffect` 等

### 6.2 更新渲染（Re-render / Update）

当 `setState`、`useReducer dispatch` 或 `context` 变化触发更新：

1. **调度更新**：React 标记需要更新的 Fiber 节点
2. **Render 阶段**（可中断）：从触发更新的节点开始，创建新的 Fiber 树（workInProgress tree），对比新旧 Fiber 树（Diff）
3. **Commit 阶段**（不可中断）：将 Diff 计算出的变更一次性应用到真实 DOM

### 6.3 Fiber 架构详解

#### 什么是 Fiber？

Fiber 是 React 16 引入的新架构，将渲染工作分解为可中断的小单元。每个 Fiber 节点是一个普通 JS 对象，包含：

```js
{
  tag: 'FunctionComponent',     // 节点类型
  type: App,                     // 组件函数/类 或 DOM 标签名
  key: null,                     // diff 用的 key
  stateNode: null,               // 真实 DOM 节点（或类组件实例）
  child: fiberNode,              // 第一个子节点
  sibling: fiberNode,            // 下一个兄弟节点
  return: fiberNode,             // 父节点
  pendingProps: {},              // 新的 props
  memoizedProps: {},             // 上次渲染的 props
  memoizedState: {},             // 上次渲染的 state（hooks 链表）
  flags: 'Update',              // 副作用标记（Placement/Update/Deletion）
  lanes: 0b0001,                // 优先级
  alternate: fiberNode,          // 指向另一棵树的对应节点（双缓冲）
}
```

#### Fiber 遍历过程（深度优先）

React 使用**深度优先遍历**，分为两个阶段：

**beginWork（向下递）**：处理当前节点，创建子 Fiber 节点

```
App
 ├─ beginWork(App)
 │   ├─ beginWork(Header)
 │   │   ├─ beginWork(h1)
 │   │   │   └─ beginWork("Hello")  ← 叶子节点，开始 completeWork
```

**completeWork（向上归）**：创建/更新 DOM 节点，收集副作用

```
 │   │   │   └─ completeWork("Hello")
 │   │   └─ completeWork(h1)
 │   └─ completeWork(Header)
 │
 │   ├─ beginWork(Content)
 │   │   └─ ...
 │   └─ completeWork(Content)
 └─ completeWork(App)
```

**遍历规则**：
1. 有子节点 → 访问第一个子节点（`child`）
2. 没有子节点 → `completeWork`，然后访问兄弟节点（`sibling`）
3. 没有兄弟节点 → 返回父节点（`return`），继续 `completeWork`

#### 双缓冲机制

React 同时维护两棵 Fiber 树：

- **current 树**：当前屏幕上显示的内容
- **workInProgress 树**：正在构建的新树

更新完成后，React 只需要把 `root.current` 指针指向 workInProgress 树即可"切换画面"，类似图形学中的双缓冲技术。

### 6.4 Diff 算法（Reconciliation）

React 的 Diff 算法基于三个假设，将 O(n³) 复杂度优化到 O(n)：

1. **不同类型的元素 → 直接替换整棵子树**
2. **同层比较 → 不会跨层级移动节点**
3. **key 标识 → 通过 key 识别哪些元素是同一个**

#### 单节点 Diff

```
旧：<div className="old">Hello</div>
新：<div className="new">World</div>
→ 类型相同(div)，复用节点，更新 props
```

```
旧：<div>Hello</div>
新：<span>Hello</span>
→ 类型不同，删除旧节点，创建新节点
```

#### 多节点 Diff（列表）

React 对列表做了专门的优化，分两轮遍历：

**第一轮**：从左到右逐个比较（处理更新场景）
- key 相同、type 相同 → 复用
- key 相同、type 不同 → 删除旧的、创建新的
- key 不同 → 停止第一轮

**第二轮**：处理新增、删除、移动
- 将剩余旧节点放入 Map（key → fiber）
- 遍历剩余新节点，在 Map 中查找可复用的
- Map 中剩余的旧节点全部标记删除

**这就是为什么列表必须加 `key`，且 key 不要用 `index`**（会导致无法正确识别移动和复用）。

### 6.5 Lanes 优先级模型

React 18 引入 Lanes 模型替代了早期的 ExpirationTime 模型，使用位运算表示优先级：

```js
const SyncLane           = 0b0000000000000000000000000000010;  // 最高优先级
const InputContinuousLane = 0b0000000000000000000000000001000;  // 连续输入
const DefaultLane        = 0b0000000000000000000000000100000;  // 默认
const TransitionLane1    = 0b0000000000000000000001000000000;  // transition
const IdleLane           = 0b0100000000000000000000000000000;  // 空闲
```

**优先级从高到低**：

| 优先级 | 触发方式 | 表现 |
|--------|---------|------|
| SyncLane | `flushSync` | 同步执行，不可中断 |
| InputContinuous | 鼠标移动、拖拽 | 高优先级，快速响应 |
| DefaultLane | `setState` 普通更新 | 正常优先级 |
| TransitionLane | `startTransition` | 低优先级，可被中断 |
| IdleLane | `requestIdleCallback` | 最低优先级 |

**Lane 的核心优势**：使用位运算，可以方便地**合并、拆分、比较**多个优先级：

```js
// 合并两个 Lane
const merged = LaneA | LaneB;

// 检查是否包含某个 Lane
const includes = (merged & LaneA) !== 0;

// 取最高优先级
const highest = merged & -merged;
```

**实际效果**：

```tsx
function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  function handleChange(e) {
    // 高优先级：立即更新输入框
    setQuery(e.target.value);

    // 低优先级：延迟更新搜索结果
    startTransition(() => {
      setResults(search(e.target.value));
    });
  }

  return (
    <>
      <input value={query} onChange={handleChange} />
      <ResultList results={results} />
    </>
  );
}
```

输入框会立即响应用户输入（SyncLane），而搜索结果列表的渲染被标记为 Transition（低优先级），不会卡住输入体验。

### 6.6 Suspense 渲染机制

Suspense 允许组件在数据未就绪时显示 fallback 内容：

```tsx
<Suspense fallback={<Loading />}>
  <AsyncComponent />
</Suspense>
```

**工作原理**：

1. **渲染子组件**：React 开始渲染 `<AsyncComponent />`
2. **抛出 Promise**：当组件内部的数据还没准备好时，会 **throw 一个 Promise**（是的，字面意义的 `throw`）
3. **捕获 Promise**：最近的 `<Suspense>` 边界捕获这个 Promise
4. **显示 fallback**：React 切换为渲染 `<Loading />`，同时监听那个 Promise
5. **Promise resolve**：数据准备好后，React 重新尝试渲染 `<AsyncComponent />`
6. **切换内容**：渲染成功后，替换 fallback 为实际内容

**Suspense 与流式 SSR（Streaming SSR）**：

在 Next.js 等框架中，Suspense 配合流式渲染：

```
服务器发送 HTML 壳子（包含 Loading fallback）
  → 浏览器立即显示 Loading 状态
  → 服务器完成数据获取
  → 通过流式传输发送实际内容的 HTML + 内联 JS
  → 浏览器替换 Loading 为实际内容（无需完整页面刷新）
```

这就是为什么 Next.js 的 `loading.tsx` 能让页面"秒开"—— 骨架屏先到达浏览器，真实内容随后流式到达。

---

## 七、总结

| 主题 | 核心要点 |
|------|---------|
| 服务端组件 | 可以 async/await，数据请求在服务器执行，浏览器看不到 |
| 客户端组件 | 不能 async，需用 useEffect/SWR 获取数据，请求在浏览器可见 |
| BOM | 浏览器对象模型，提供 `localStorage`/`sessionStorage`/`IndexedDB` 等存储 |
| 浏览器渲染 | DNS → TCP → HTTP → HTML/CSS 解析 → Render Tree → Layout → Paint → Composite |
| JS/CSS 阻塞 | JS 阻塞 HTML 解析；CSS 不阻塞 HTML 解析但阻塞渲染和 JS 执行 |
| React 定位 | 工作在 JS 执行层，通过 DOM API 操作真实 DOM |
| Fiber | 可中断的渲染单元，深度优先遍历，双缓冲机制 |
| Diff | 同层比较 + key 标识，O(n) 复杂度 |
| Lanes | 位运算优先级模型，实现高/低优先级更新调度 |
| Suspense | 通过 throw Promise 机制，支持异步加载和流式 SSR |

---

*本文整理自一次技术讨论，涵盖了前端开发中最核心的知识点。理解这些底层机制，能帮助我们写出更高效、更可维护的代码。*
