"use client"

/**
 * =====================================================
 * 地图包装器组件 (客户端组件)
 * =====================================================
 * 
 * 这个文件单独处理动态导入,因为:
 * - ssr: false 必须在客户端组件中使用
 * - page.tsx 默认是服务端组件
 * =====================================================
 */

import dynamic from "next/dynamic"

/**
 * 动态加载地图组件
 * 
 * 为什么要动态加载?
 * - 地图组件依赖浏览器的window对象
 * - 服务端渲染时没有window,会报错
 * - 使用dynamic + ssr:false可以延迟到浏览器端再加载
 */
const CustomerMap = dynamic(
  () => import("@/components/customer-map"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">加载地图中...</div>
      </div>
    ),
  }
)

export default function MapWrapper() {
  return <CustomerMap />
}
