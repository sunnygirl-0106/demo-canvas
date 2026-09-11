import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { sceneInitial } from './demo/scenes'

sceneInitial(location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
