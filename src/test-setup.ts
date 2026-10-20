import { setConsentChecker } from './api/client'

// Tests act as a user who has passed the gate. src/api/gate.test.ts overrides this to prove the deny path.
setConsentChecker(() => true)
