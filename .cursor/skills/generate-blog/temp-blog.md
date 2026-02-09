当你在 Web 端用 react-pageflip 做一个翻页书阅读器，50 页的书翻起来很流畅，但导入一本 800 页的小说后，每翻一页都能感受到明显的卡顿——有时甚至要等 200ms 以上才响应。这不是偶发问题，而是一个架构级的性能缺陷。

本文记录我如何定位这个问题，以及最终用 `useSyncExternalStore` 将翻页开销从 O(N) 降到 O(1) 的完整过程。

## 为什么卡？——一次翻页触发的级联反应

要理解性能问题，必须先搞清楚翻页时到底发生了什么。

### 旧架构的数据流

阅读器的核心结构是这样的：

```jsx
// EpubReaderView.tsx
function EpubReaderView() {
  const [currentPage, setCurrentPage] = useState(0);
  
  return (
    <HTMLFlipBook onFlip={(e) => setCurrentPage(e.data)}>
      {pages.map((p) => (
        <BookPage
          key={p.pageIndex}
          chapterHtml={isNear(p, currentPage) ? fullHtml : ''}
          // ... 12 个 props
        />
      ))}
    </HTMLFlipBook>
  );
}
```

看起来很合理：翻页时更新 `currentPage`，根据距离决定哪些页面渲染真实内容（懒渲染窗口），远离当前页的渲染空白占位。

但问题藏在 `setCurrentPage` 触发的级联反应里。

### 级联反应链（以 800 页为例）

| 步骤 | 发生了什么 | 耗时 |
|:---|:---|:---|
| 1 | `setCurrentPage` → 父组件 re-render | ~1ms |
| 2 | `pages.map(800)` 创建 800 个新 JSX 元素 | ~2ms |
| 3 | 800 个新 children → HTMLFlipBook 的 `React.memo` 失败 → re-render | ~1ms |
| 4 | 库内部 `React.Children.map` 克隆 800 个元素，重置所有 ref | ~5ms |
| 5 | `updateFromHtml()` 重建整个 `PageCollection`（800 个 `HTMLPage` 实例） | ~10ms |
| 6 | 800 个 `BookPage` 的 `React.memo` 比较（每个 12 个 prop） | ~15ms |
| 7 | ~13 个进入窗口的 BookPage 执行 `dangerouslySetInnerHTML` | 50-200ms |
| **合计** | 每翻一页的总阻塞时间 | **~80-230ms** |

这就是为什么 50 页的书流畅、800 页的书卡顿——**翻页开销是 O(N) 的**。

### 深入库源码：被忽略的"隐性重建"

最隐蔽的问题出在第 4-5 步。react-pageflip 的 `html-flip-book/index.tsx` 内部是这样处理 children 变化的：

```tsx
// react-pageflip 库内部
useEffect(() => {
  childRef.current = []; // 重置所有页面引用！
  
  const childList = React.Children.map(props.children, (child) => {
    return React.cloneElement(child, {
      ref: (dom) => { childRef.current.push(dom); },
    });
  });
  
  setPages(childList); // 触发第二次 render
}, [props.children]); // children 引用变了就触发

useEffect(() => {
  if (pages.length > 0 && childRef.current.length > 0) {
    pageFlip.current.updateFromHtml(childRef.current); // 重建整个页面集合
  }
}, [pages]);
```

关键点：**`props.children` 是一个数组**。即使数组内容完全相同，只要父组件 re-render 执行了 `pages.map()`，就会产生一个新的数组引用。新引用 → effect 触发 → 800 个 `cloneElement` → `setPages` → 第二次 render → `updateFromHtml` 重建所有 `HTMLPage` 实例。

**每翻一页，整个 800 页的页面集合都会被销毁重建。**

这才是性能的真正杀手。

## 解决方案：用 useSyncExternalStore 实现 O(1) 翻页

### 核心思路

问题的本质是：**翻页改变的只是"哪些页面需要渲染内容"这个信息，但我们用 React state 来传递它，导致了不必要的级联 re-render。**

解决方案：把 `currentPage` 从 React state 移到一个外部存储（External Store），让每个 BookPage 自己订阅，自己决定是否需要更新。

```
旧架构：翻页 → setState → 父 re-render → 800 个 children 重建 → 库重建
新架构：翻页 → store.setPage() → 仅通知 ~4 个跨边界的 BookPage → 父零 re-render
```

### 第一步：创建 PageStore

不用 Redux，不用 Zustand，一个简单的 ref + 订阅者模式就够了：

```typescript
function createPageStore() {
  let currentPage = 0;
  let lazyWindow = 6;
  const listeners = new Set<() => void>();

  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getPage: () => currentPage,
    setPage: (page: number) => {
      if (currentPage !== page) {
        currentPage = page;
        listeners.forEach(l => l());
      }
    },
    getLazyWindow: () => lazyWindow,
    setLazyWindow: (w: number) => {
      if (lazyWindow !== w) {
        lazyWindow = w;
        listeners.forEach(l => l());
      }
    },
  };
}
```

这个 store 没有任何 React state。`setPage()` 只通知订阅者，**不会触发任何组件的 setState**。

### 第二步：BookPage 内部自治

每个 BookPage 通过 `useSyncExternalStore` 订阅 store，自行判断是否在懒渲染窗口内：

```tsx
const BookPage = React.forwardRef((props, ref) => {
  const pageStore = useContext(PageStoreContext);

  const getIsNear = useCallback(() => {
    return Math.abs(props.pageIndex - pageStore.getPage()) 
           <= pageStore.getLazyWindow();
  }, [pageStore, props.pageIndex]);

  // 只有 isNear 变化时才 re-render
  const isNear = useSyncExternalStore(
    pageStore.subscribe,
    getIsNear,
  );

  const activeHtml = isNear ? props.chapterHtml : '';
  
  // ... 渲染逻辑
});
```

`useSyncExternalStore` 的关键特性：每次 store 通知时，它调用 `getIsNear()` 获取新值，用 `Object.is` 比较旧值。**如果 `isNear` 没变（绝大多数页面），组件不会 re-render。** 这意味着 800 个页面中只有 ~4 个（跨越窗口边界的）会实际更新。

### 第三步：让 children 稳定

现在 BookPage 自己管理懒渲染，父组件不再需要 `currentPage` 来决定传什么 `chapterHtml`。所以我们可以创建一个**引用稳定的 children 数组**：

```tsx
// children 不依赖 currentPage！
const stableChildren = useMemo(() => {
  return pages.map((p) => (
    <BookPage
      key={p.pageIndex}
      chapterHtml={chapters[p.chapterIndex]?.html || ''}
      // ... 其他稳定 props
    />
  ));
}, [pages, chapters, fontSize, ...]); // 没有 currentPage！
```

这样：

1. 翻页时 `stableChildren` 引用不变
2. HTMLFlipBook 的 `React.memo` 比较 `prevProps.children === nextProps.children` → **命中** → 跳过 re-render
3. 库内部的 effect 不触发 → 零 `cloneElement` → 零 `PageCollection` 重建

### 结果对比

**旧架构（每次翻页）：**

| 操作 | 耗时 |
|:---|:---|
| 父 re-render + 800 createElement | ~3ms |
| 库 clone 800 + 重建 PageCollection | ~15ms |
| 800 个 React.memo 比较 | ~15ms |
| ~13 个 innerHTML | 50-200ms |
| **合计** | **~80-230ms** |

**新架构（每次翻页）：**

| 操作 | 耗时 |
|:---|:---|
| store 通知 800 个订阅者 | ~0.1ms |
| 800 个 getIsNear() | ~0.5ms |
| ~4 个 BookPage re-render | ~5ms |
| **合计** | **~6ms** |

**性能提升 15-30 倍。800 页和 50 页一样流畅。**

## 实现中的难点

### 难点一：useSyncExternalStore 与 React.memo 的交互

一个容易忽略的问题：BookPage 包裹了 `React.memo`。当父组件 re-render 时，memo 比较 props；如果相同就跳过。但 `useSyncExternalStore` 的订阅回调是在**组件内部**触发的"状态变更"，**绑定在组件实例上而非 props 上**，所以即使 memo 跳过了来自父组件的 re-render，store 变化仍然能触发该组件自己的 re-render。

这正是我们需要的行为：memo 阻止父组件的无效 re-render，store 触发自身的有效 re-render，两者互不干扰。

### 难点二：getSnapshot 必须是稳定的纯函数

`useSyncExternalStore` 要求 `getSnapshot` 在 store 状态不变时返回相同的值。我用 `useCallback` 确保函数引用稳定，并且内部只依赖 `pageIndex`（对每个 BookPage 实例而言是常量）和 store 的可变状态（通过闭包访问）。

如果 `getSnapshot` 不稳定（比如每次 render 创建新函数），React 会在每次 render 时重新订阅，造成不必要的开销。

### 难点三：Context value 不能因翻页而变化

`PageStoreContext.Provider` 的 `value` 必须是稳定的引用。如果每次翻页更新 context value，所有 `useContext(PageStoreContext)` 的消费者都会 re-render，又回到 O(N) 的问题。

解决方案：store 对象用 `useState(createPageStore)` 创建一次，之后不再变。`lazyWindow` 的变化（桌面/移动端切换）也通过 store 内部的可变变量 + 手动通知处理，不改变 context value 的引用。

## 总结

这次优化的核心教训是：**React 的 state 更新是"广播式"的——一个 setState 会沿组件树向下传播，触发所有依赖链上的组件重新评估。** 当组件数量从 50 增长到 800 时，这个线性开销就变成了用户可感知的卡顿。

`useSyncExternalStore` 提供了一种"点对点"的更新机制：只有关心某个值的组件才会收到通知，且只有值真正变化时才会 re-render。这把翻页的复杂度从 O(N) 降到了 O(1)。

这个模式不仅适用于翻页书，任何存在"大量组件共享一个频繁变化的值，但每个组件只关心该值的一个派生结果"的场景，都可以用同样的思路优化。比如虚拟列表的滚动位置、画布编辑器的缩放比例、实时协作的光标位置等。
