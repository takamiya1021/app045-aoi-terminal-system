import withPWAInit from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {};

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // Service Worker強制更新機能（CLAUDE.md要件準拠）
  skipWaiting: true,
  register: true,
  scope: '/',
});

export default withPWA(nextConfig);
