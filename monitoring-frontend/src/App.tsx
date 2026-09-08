import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { ThemeProvider } from './context/ThemeContext';
import { FilterProvider } from './context/FilterContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <FilterProvider>
          <RouterProvider router={router} />
        </FilterProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
