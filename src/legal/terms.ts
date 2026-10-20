// Terms and Content Policy shown at the age gate and under Settings > About.
//
// DRAFT: written by the build agent, NOT reviewed by a lawyer. It must go through legal review before any
// public release (see docs/privacy-and-terms.md). Bump TERMS_VERSION whenever the meaning changes: everyone
// is asked to accept again.
export const TERMS_VERSION = '2026-10-20.1'

export interface TermsSection {
  title: string
  body: string[]
}

export const TERMS_DRAFT_NOTICE = 'Draft wording, pending legal review.'

export const TERMS: TermsSection[] = [
  {
    title: 'What Flotsam is',
    body: [
      'Flotsam is an independent app for using your own Graydient account from a phone. It is not made, endorsed or supported by Graydient. It does not generate content itself: your requests go to the Graydient service under your account and their terms.',
    ],
  },
  {
    title: 'Adults only (18+)',
    body: [
      'Flotsam can show images, video, audio and other output that is adult, explicit or otherwise upsetting, because the workflows you choose can produce it. You must be 18 or older (or the age of majority where you live, if higher) to use it.',
      'Confirming your age here is a declaration you make. It is not age verification.',
    ],
  },
  {
    title: 'Content policy',
    body: [
      'You are responsible for what you generate, upload, save and share. Do not use Flotsam to create, upload or share anything illegal, including any sexual content involving minors, and nothing that depicts a real person in a sexual or abusive way without their consent.',
      'Adult workflows are hidden until you turn them on, and results are blurred until you tap them. These are conveniences, not safeguards against what you choose to make.',
    ],
  },
  {
    title: 'Your data stays on your device',
    body: [
      'Your API key, history, settings and any PIN are stored only in this browser or app on your device. Flotsam has no account system and no analytics. "Clear all data" in Settings removes it. Clearing your browser data removes it too.',
      'Generated results are not stored by Flotsam: it keeps links to them, and saves a file only when you tap Save or Share.',
    ],
  },
  {
    title: 'Other services',
    body: [
      'Flotsam talks to Graydient (to run renders), and, only if you set them up, to Catbox (to host a photo you want to use as an input) and ModelTrends (to show a public popularity score). Each has its own terms and privacy rules. Photos you upload go to the host you choose, not to Flotsam. Requests from the web version pass through a relay that forwards them and stores nothing.',
    ],
  },
  {
    title: 'No warranty',
    body: [
      'Flotsam is provided as is, without promises that it will work, stay available or fit your needs. Renders can fail, take a long time, or cost you quota on your Graydient account.',
    ],
  },
]
