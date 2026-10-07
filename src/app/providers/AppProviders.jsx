import { AuthProvider } from '@/features/auth/providers/AuthProvider';

export default function AppProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
