import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function manualChunks(id: string) {
    const normalizedId = id.replace(/\\/g, '/');

    if (!normalizedId.includes('/node_modules/')) {
        return undefined;
    }

    if (
        normalizedId.includes('/react/') ||
        normalizedId.includes('/react-dom/') ||
        normalizedId.includes('/scheduler/') ||
        normalizedId.includes('/react-router/') ||
        normalizedId.includes('/react-router-dom/')
    ) {
        return 'vendor-react';
    }

    if (
        normalizedId.includes('/antd/') ||
        normalizedId.includes('/@ant-design/') ||
        normalizedId.includes('/lucide-react/') ||
        normalizedId.includes('/framer-motion/')
    ) {
        return 'vendor-ui';
    }

    if (
        normalizedId.includes('/@jadesnow7/edge-ai-sdk/') ||
        normalizedId.includes('/react-markdown/') ||
        normalizedId.includes('/remark-') ||
        normalizedId.includes('/rehype-')
    ) {
        return 'vendor-ai';
    }

    return undefined;
}

export default defineConfig(() => {
    const isDesktopBuild =
        process.env.VITE_DESKTOP_BUILD === 'true' ||
        Boolean(process.env.TAURI_PLATFORM || process.env.TAURI_ARCH);
    const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080';

    return {
        base: isDesktopBuild ? './' : '/',
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        build: {
            chunkSizeWarningLimit: 1000,
            rollupOptions: {
                output: {
                    manualChunks,
                },
            },
        },
        server: {
            port: 5173,
            proxy: {
                '/api/v1': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                },
            },
        },
    };
});
