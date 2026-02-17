/**
 * Badge 徽章组件
 *
 * 来源：shadcn/ui 组件库
 * 用途：显示状态标签、标记、计数等小型信息块
 *
 * 使用示例：
 * <Badge>默认徽章</Badge>
 * <Badge variant="secondary">次要徽章</Badge>
 * <Badge variant="destructive">警告徽章</Badge>
 * <Badge variant="outline">边框徽章</Badge>
 */

import * as React from "react"
import { Slot } from "@radix-ui/react-slot" // Radix UI的Slot组件，用于组件组合
import { cva, type VariantProps } from "class-variance-authority" // CVA：用于管理组件变体样式的工具

import { cn } from "@/lib/utils" // 工具函数：合并className

/**
 * badgeVariants - 使用CVA定义徽章的样式变体
 *
 * 基础样式说明：
 * - inline-flex items-center justify-center: 内联弹性布局，内容居中
 * - rounded-md: 圆角
 * - border: 边框
 * - px-2 py-0.5: 内边距（水平8px，垂直2px）
 * - text-xs font-medium: 小号字体，中等粗细
 * - w-fit whitespace-nowrap: 宽度自适应，不换行
 * - shrink-0: 不收缩
 * - [&>svg]:size-3: 内部SVG图标大小为12px
 * - gap-1: 元素间距4px
 * - focus-visible:...: 键盘聚焦时的样式
 * - aria-invalid:...: 无效状态时的样式
 * - transition-[color,box-shadow]: 颜色和阴影过渡动画
 * - overflow-hidden: 溢出隐藏
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    /**
     * variants - 定义不同样式变体
     */
    variants: {
      variant: {
        // default: 默认样式 - 主色背景，白色文字
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        // secondary: 次要样式 - 灰色背景
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        // destructive: 危险/警告样式 - 红色背景
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        // outline: 轮廓样式 - 只有边框，无背景
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    // 默认使用default变体
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * Badge 组件
 *
 * @param className - 自定义CSS类名
 * @param variant - 样式变体：default | secondary | destructive | outline
 * @param asChild - 是否将样式传递给子元素（使用Radix Slot）
 * @param props - 其他span元素的属性
 *
 * asChild说明：
 * - false（默认）：渲染为<span>元素
 * - true：不渲染span，而是将样式传递给子元素
 *   例如：<Badge asChild><a href="/">链接徽章</a></Badge>
 *   这样a标签就会带有Badge的样式
 */
function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  // 根据asChild决定渲染Slot还是span
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge" // 用于CSS选择器或测试定位
      className={cn(badgeVariants({ variant }), className)} // 合并变体样式和自定义类名
      {...props}
    />
  )
}

// 导出组件和样式变体（样式变体可用于其他需要相同样式的场景）
export { Badge, badgeVariants }
