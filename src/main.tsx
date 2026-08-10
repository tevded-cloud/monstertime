import { createRoot } from 'react-dom/client'
import App from './ui/App'
import { restoreGroupOnLaunch } from './ui/useGroup'
import './index.css'

// Before the first render, deliberately. Routing reads location.hash, so
// putting the group back after mounting would paint the new-group screen and
// then replace it, which is a visible flash of the wrong answer on exactly the
// launch this exists to fix. It is a no-op in a browser tab.
restoreGroupOnLaunch()

const host = document.getElementById('root')
if (!host) throw new Error('MonsterTime needs a #root element to mount into.')

// No StrictMode. The stage hands a real canvas to a WebGL renderer that owns it
// for the lifetime of the mount, and StrictMode's deliberate double mount would
// build and tear that down twice on the same element, which is the one thing
// three.js handles worst. The trade is dev-only warnings we give up; the
// alternative is a black stage in development and a false alarm every time.
createRoot(host).render(<App />)
