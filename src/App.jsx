import { BrowserRouter } from 'react-router-dom'
import SwolTracker from './swoltracker'
import { ToastProvider } from './components/Toast'
import { SessionProvider } from './contexts'

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <SwolTracker />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
