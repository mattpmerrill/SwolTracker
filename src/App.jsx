import SwolTracker from './swoltracker'
import { ToastProvider } from './components/Toast'

function App() {
  return (
    <ToastProvider>
      <SwolTracker />
    </ToastProvider>
  )
}

export default App