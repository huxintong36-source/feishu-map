/**
 * =====================================================
 * 主页面入口文件 (app/page.tsx)
 * =====================================================
 * 
 * 这是网站的主页面,负责加载和显示地图组件
 * 这是服务端组件,引用客户端的MapWrapper
 * =====================================================
 */

import MapWrapper from "./map-wrapper"

/**
 * 页面主组件
 */
export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <MapWrapper />
    </main>
  )
}
