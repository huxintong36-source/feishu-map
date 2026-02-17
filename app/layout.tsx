import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google" // Google字体
import { Analytics } from "@vercel/analytics/next" // Vercel访问统计
import "./globals.css" // 全局CSS样式

// 加载Geist字体(现代化的无衬线字体)
const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] }) // 等宽字体,用于代码显示

/**
 * 网页元数据配置
 * 
 * 这些信息会显示在:
 * - 浏览器标签页标题
 * - 搜索引擎结果
 * - 社交媒体分享预览
 */
export const metadata: Metadata = {
  title: "地图", // 网页标题
  description: "地图", // 网页描述
  generator: "hxt", // 
  
  // 网站图标配置(支持明暗模式)
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)", // 浅色模式用的图标
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)", // 深色模式用的图标
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml", // SVG格式图标
      },
    ],
    apple: "/apple-icon.png", // 苹果设备专用图标
  },
}

/**
 * 根布局组件
 * 
 * @param children - 子页面内容,会被插入到body中
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      {/* 
        body标签设置:
        - font-sans: 使用无衬线字体
        - antialiased: 字体抗锯齿,让文字更平滑
      */}
      <body className={`font-sans antialiased`}>
        {children} {/* 这里会渲染具体的页面内容 */}
        <Analytics /> {/* Vercel访问统计组件 */}
      </body>
    </html>
  )
}
