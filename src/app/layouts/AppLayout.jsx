import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import useAppearanceQuality from '@/shared/hooks/useAppearanceQuality';
import AmbientEffects from '@/shared/components/AmbientEffects';
import DolphinAssistant from '@/features/assistant/components/DolphinAssistant';

export default function AppLayout({ children }) {
  const { pathname } = useLocation();
  const isTeacherPage = pathname.startsWith('/teacher');
  const isTakeExamPage = pathname.startsWith('/student/exam/');
  const { quality } = useAppearanceQuality();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className="app-shell min-h-screen flex flex-col" data-exam-active={isTakeExamPage}>
      {quality === 'ultra' && !isTakeExamPage && <AmbientEffects />}
      {!isTeacherPage && !isTakeExamPage && <Navigation />}
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      {!isTakeExamPage && <DolphinAssistant />}
    </div>
  );
}
