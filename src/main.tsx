import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './index.css'

const host = document.getElementById('root')
if (!host) throw new Error('MonsterTime needs a #root element to mount into.')

// No StrictMode. The stage hands a real canvas to a WebGL renderer that owns it
// for the lifetime of the mount, and StrictMode's deliberate double mount would
// build and tear that down twice on the same element, which is the one thing
// three.js handles worst. The trade is dev-only warnings we give up; the
// alternative is a black stage in development and a false alarm every time.
createRoot(host).render(<App />)
