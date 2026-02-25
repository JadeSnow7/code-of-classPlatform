import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import './index.css'
import { AppRouter } from './app/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#8B5CF6', // Purple/Violet shade from Figma
          colorBgBase: '#0D0E15',
          colorBgContainer: '#13141F',
          colorBorder: '#1E1F2E',
        },
      }}
    >
      <App>
        <AppRouter />
      </App>
    </ConfigProvider>
  </StrictMode>,
)
