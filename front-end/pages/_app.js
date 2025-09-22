import Sidebar from '../components/Sidebar';
import TopHeader from '../components/TopHeader';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '../styles/global.css';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const publicPaths = ['/login'];
  const isPublic = publicPaths.some(p => router.pathname === p);

  useEffect(() => {
    // simple client-side guard: if visiting protected path and no token, redirect to /login
    const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
    if (!isPublic && !token) {
      router.push('/login');
    }
  }, [router, isPublic]);
  // If this is a public page (login) render minimal full-width layout without sidebar/header
  if (isPublic) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff' }}>
        <Component {...pageProps} />
        <ToastContainer />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'white' }}>
      <Sidebar />
      <main style={{ flex: 1 }}>
        <TopHeader />
        <div style={{ padding: 24 }}>
          <Component {...pageProps} />
        </div>
        <ToastContainer />
      </main>
    </div>
  );
}