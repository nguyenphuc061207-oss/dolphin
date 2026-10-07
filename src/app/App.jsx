import { BrowserRouter } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import AppRoutes from './router/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <AppRoutes />
      </AppLayout>
    </BrowserRouter>
  );
}
