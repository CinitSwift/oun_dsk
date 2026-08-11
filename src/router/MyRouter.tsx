import React, { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, useLocation } from 'react-router'
import { AnimatePresence } from 'framer-motion'
import { Spinner } from '@heroui/spinner'
import SettingsPage from '@/pages/Settings'

const Layout = lazy(() => import('@/components/layouts/Layout'))
const SearchResult = lazy(() => import('@/pages/SearchResult'))
const Detail = lazy(() => import('@/pages/Detail'))
const Video = lazy(() => import('@/pages/Video'))

import { useApiStore } from '@/store/apiStore'
import { useSearchStore } from '@/store/searchStore'
import { INITIAL_VIDEO_SOURCES_VERSION } from '@/config/api.config'
import { isAndroidApp } from '@/config/proxy-url'
import { useEffect } from 'react'

import AuthGuard from '@/components/AuthGuard'

const INITIAL_VIDEO_SOURCES_VERSION_KEY = 'initialVideoSourcesVersion'

function AnimatedRoutes({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { initializeEnvSources } = useApiStore()
  const { cleanExpiredCache } = useSearchStore()

  useEffect(() => {
    // 清理过期的搜索缓存
    cleanExpiredCache()

    // 按默认源版本执行一次初始化，避免重复恢复用户主动删除的源
    const initializedVersion = localStorage.getItem(INITIAL_VIDEO_SOURCES_VERSION_KEY)
    const needsInitialization = initializedVersion !== INITIAL_VIDEO_SOURCES_VERSION
    if (needsInitialization) {
      void initializeEnvSources().then(() => {
        localStorage.setItem(INITIAL_VIDEO_SOURCES_VERSION_KEY, INITIAL_VIDEO_SOURCES_VERSION)
        localStorage.removeItem('envSourcesInitialized')
      })
    }
  }, [initializeEnvSources, cleanExpiredCache])

  return (
    <AuthGuard>
      <AnimatePresence mode="wait">
        <Suspense
          fallback={
            <div className="flex flex-col items-center py-40">
              <Spinner
                classNames={{ label: 'text-gray-500 text-sm' }}
                variant="default"
                size="lg"
                color="default"
                label="加载中..."
              />
            </div>
          }
        >
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={children} />
            <Route element={<Layout />}>
              <Route path="search/:query" element={<SearchResult />} />
              <Route path="video/:sourceCode/:vodId/:episodeIndex" element={<Video />} />
              <Route path="detail/:sourceCode/:vodId" element={<Detail />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </AnimatePresence>
    </AuthGuard>
  )
}

export default function MyRouter({ children }: { children: React.ReactNode }) {
  const Router = window.ounDesktop || isAndroidApp() ? HashRouter : BrowserRouter

  return (
    <Router>
      <AnimatedRoutes>{children}</AnimatedRoutes>
    </Router>
  )
}
