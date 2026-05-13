import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060810' }}>
      <SignIn forceRedirectUrl="/cockpit" fallbackRedirectUrl="/cockpit" />
    </div>
  )
}
