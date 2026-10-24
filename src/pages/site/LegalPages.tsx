import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AI_DAILY_LIMIT, PLANS, PRODUCT, SITE_URL } from '../../config'
import { PageHeader, SiteShell } from './SiteShell'

const UPDATED = '24 October 2026'

function LegalDoc({ title, eyebrow, intro, children }: { title: string; eyebrow: string; intro: ReactNode; children: ReactNode }) {
  return (
    <SiteShell title={title}>
      <PageHeader eyebrow={eyebrow} title={title}>
        <p>{intro}</p>
        <p className="mt-3 text-[13px] text-slate-500">Last updated {UPDATED}</p>
      </PageHeader>
      <article className="mx-auto max-w-3xl px-4 py-14 text-[15px] leading-[1.75] text-slate-700 sm:px-6 [&_a]:font-medium [&_a]:text-orange-700 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-900 [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:text-slate-900 [&_table]:mt-4 [&_table]:w-full [&_table]:text-[14px] [&_td]:border-t [&_td]:border-slate-200 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-[13px] [&_th]:font-semibold [&_th]:text-slate-900 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </article>
    </SiteShell>
  )
}

const Contact = () => <Link to="/contact">contact form</Link>

const price = (id: keyof typeof PLANS) => `$${PLANS[id].price}`

export function PrivacyPage() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Privacy policy"
      intro={`How ${PRODUCT} handles your information. The short version: your slides, scripts and voice stay on your device.`}
    >
      <p>
        This policy explains what information {PRODUCT} (“we”, “us”), available at <a href={SITE_URL}>{SITE_URL.replace('https://', '')}</a> and as a
        desktop app, collects, why, and the choices you have. By using {PRODUCT} you agree to this policy.
      </p>

      <h2>What stays on your device</h2>
      <ul>
        <li>
          <strong>Presentations, slides, scripts and notes.</strong> They are stored in your browser (IndexedDB) or, in the desktop app, in files on your
          computer. We do not upload them.
        </li>
        <li>
          <strong>Your voice.</strong> Speech recognition runs on your device (Whisper on WebGPU in the browser, or Metal in the Mac app). Microphone audio is
          never recorded or sent to us.
        </li>
        <li>
          <strong>Call audio.</strong> If you use the SI copilot's “Listen to the call”, the audio of the tab you share is transcribed on your device and
          is not recorded or uploaded.
        </li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> your email address, name (if you give one) and a securely hashed password. We use them to sign you in,
          provide your plan and contact you about your account.
        </li>
        <li>
          <strong>Plan and payment records:</strong> the plan you bought, the amount, currency, dates and the order and payment IDs from Razorpay. Card,
          UPI and bank details are entered directly with Razorpay and are never seen or stored by us.
        </li>
        <li>
          <strong>SI copilot requests:</strong> when you ask the copilot (or it detects a question on your call), the question text and the relevant text
          of your deck, scripts and Q&A prep notes are sent to an AI provider to generate the answer — our built-in provider, or the provider you
          chose in Settings → SI. We do not store the questions or answers; we keep only a count of requests to apply plan limits.
        </li>
        <li>
          <strong>Your own AI API keys:</strong> if you add an API key for a provider such as OpenAI, Anthropic or Google in Settings → SI, it is
          stored only on your device and requests go directly from your device to that provider, under its terms and privacy policy. We never
          receive your key.
        </li>
        <li>
          <strong>Messages you send us</strong> through the contact form: your name, email and message.
        </li>
        <li>
          <strong>Basic technical logs</strong> kept by our hosting and database providers (such as IP address and request times) for security and
          reliability.
        </li>
      </ul>
      <p>We do not use advertising or tracking cookies, and we do not sell or rent personal information.</p>

      <h2>Service providers</h2>
      <p>We share information only with providers that run the service for us, under their own privacy and security commitments:</p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase</td>
            <td>Accounts, sign-in and our database</td>
          </tr>
          <tr>
            <td>Razorpay</td>
            <td>Payment processing</td>
          </tr>
          <tr>
            <td>Anthropic (Claude API)</td>
            <td>Generating SI copilot answers and AI script drafts with the built-in AI</td>
          </tr>
          <tr>
            <td>The AI provider you choose</td>
            <td>Only if you add your own API key in Settings → SI; requests go straight from your device to it</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Hosting the website</td>
          </tr>
          <tr>
            <td>Hugging Face</td>
            <td>One-time download of the on-device speech model (no personal data is sent)</td>
          </tr>
        </tbody>
      </table>
      <p>We may also disclose information if required by law or to protect the rights and safety of our users and the service.</p>

      <h2>How long we keep it</h2>
      <p>
        Account information is kept while your account is open. Payment records are kept as long as tax and accounting laws require. Contact messages
        are kept as long as needed to answer them. When you delete your account we delete your profile; payment records we must keep are retained
        without being used for anything else.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us to access, correct, export or delete your personal information, or object to how we use it, by writing to us through the{' '}
        <Contact />. We respond within 30 days. Data on your device is under your control: clear it from your browser or delete the app's files.
      </p>

      <h2>Security</h2>
      <p>
        Connections are encrypted (HTTPS). Passwords are hashed, database access is restricted per account with row-level security, and payment and AI
        credentials are stored server-side, never in the app.
      </p>

      <h2>Children</h2>
      <p>{PRODUCT} is not intended for children under 16, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update this page and the date above. Significant changes will be shown in the app or emailed to you.</p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Reach us through the <Contact /> and choose “Privacy”.
      </p>
    </LegalDoc>
  )
}

export function TermsPage() {
  return (
    <LegalDoc eyebrow="Legal" title="Terms & conditions" intro={`The agreement between you and ${PRODUCT} when you use the website, web app or desktop app.`}>
      <p>
        By creating an account or using {PRODUCT} (the “Service”) you agree to these terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        {PRODUCT} is software for presenters: it imports slide decks, lets you write or paste a speaking script, and shows a teleprompter that follows
        your voice. The SI plan adds an AI copilot that suggests answers to questions asked during a call.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must give a valid email address and keep your password secure. You are responsible for activity under your account. You must be at least 16
        years old, or the age of majority where you live if higher, to buy a plan.
      </p>

      <h2>3. Plans</h2>
      <p>There is no free plan or trial: using the Service requires one of these paid plans.</p>
      <ul>
        <li>
          <strong>Standard (non-SI)</strong> — {price('standard_monthly')} per month or {price('standard_yearly')} per year: the teleprompter for your own
          script, with unlimited usage during the period you paid for.
        </li>
        <li>
          <strong>SI (Super Intelligence)</strong> — {price('si_monthly')} per month or {price('si_yearly')} per year: everything in Standard plus the AI
          copilot, with fair use of up to {AI_DAILY_LIMIT} AI answers per day.
        </li>
      </ul>

      <h2>4. Payment</h2>
      <p>
        Prices are in US dollars and are charged in advance through Razorpay. Each payment activates the plan for one month or one year from the time of
        payment (or from the end of your current period of the same plan, if it is still active). Plans do <strong>not</strong> renew automatically;
        you are never charged without completing a payment yourself. Your bank may add currency conversion or international transaction fees. Refunds
        are covered by the <Link to="/refunds">refund & cancellation policy</Link>.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>break any law, or infringe anyone's rights, using the Service;</li>
        <li>
          use the call-listening feature without the consent required by the laws that apply to your call, or where the meeting, interview, exam or
          platform rules prohibit assistance tools — you are responsible for following those rules;
        </li>
        <li>attempt to access other users' data, disrupt the Service, or bypass plan limits or security;</li>
        <li>resell or share your account, or automate requests to the AI copilot.</li>
      </ul>

      <h2>6. AI-generated content</h2>
      <p>
        Copilot answers and script drafts are generated automatically from the material you provide. They can be incomplete or wrong. Review them
        before you rely on them; you are responsible for what you say and present. If you connect your own AI provider, its terms and charges apply
        to that usage and you are responsible for your API key.
      </p>

      <h2>7. Your content</h2>
      <p>
        You keep all rights to your decks, scripts and notes. They are stored on your device. You give us permission to process the parts you send to
        the AI copilot only to produce your answers.
      </p>

      <h2>8. Our software</h2>
      <p>
        The Service, its design and software belong to {PRODUCT} and its licensors. We grant you a personal, non-transferable right to use it while your
        account is in good standing.
      </p>

      <h2>9. Suspension and termination</h2>
      <p>
        You can stop using the Service at any time and ask us to delete your account. We may suspend or close accounts that break these terms. If we
        close your account without cause, we refund the unused part of your current paid period.
      </p>

      <h2>10. Disclaimers and liability</h2>
      <p>
        The Service is provided “as is”. We work to keep it available and accurate but do not guarantee it will be uninterrupted or error-free, or that
        speech recognition or AI answers will be correct. To the extent the law allows, we are not liable for indirect or consequential losses, and our
        total liability is limited to the amount you paid us in the 12 months before the claim.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these terms. We will post changes here with a new date; material changes will be notified in the app or by email. Continuing to
        use the Service after a change means you accept it. Price changes never affect a period you have already paid for.
      </p>

      <h2>12. Governing law</h2>
      <p>These terms are governed by the laws of India. Disputes will first be addressed through good-faith discussion via our contact form.</p>

      <h2>13. Contact</h2>
      <p>
        Questions about these terms? Use the <Contact />.
      </p>
    </LegalDoc>
  )
}

export function RefundPage() {
  return (
    <LegalDoc eyebrow="Billing" title="Refund & cancellation policy" intro="Clear, fair rules for refunds and ending a plan.">
      <h2>Cancellation</h2>
      <p>
        Standard and SI plans are prepaid for one month or one year and <strong>do not renew automatically</strong>, so there is nothing to cancel: your
        plan simply ends at the end of the period you paid for, and you will not be charged again unless you choose to buy another period.
      </p>

      <h2>7-day refund on your first payment</h2>
      <p>
        If {PRODUCT} isn't right for you, request a refund within <strong>7 days</strong> of your first payment for a plan, and we will refund it in full
        — no questions asked.
      </p>

      <h2>Other refunds</h2>
      <ul>
        <li>
          <strong>Duplicate or mistaken payments</strong> (for example, paying twice for the same plan) are refunded in full when reported within 30
          days.
        </li>
        <li>
          <strong>Service problems:</strong> if a fault on our side stops you using a paid feature and we cannot fix it, we refund the unused part of
          your period.
        </li>
        <li>
          Apart from these cases, payments for periods that have already started are not refundable, except where the law requires otherwise.
        </li>
      </ul>

      <h2>How to request a refund</h2>
      <p>
        Use the <Contact /> and choose “Refund”, from the email address of your account, with the date of payment (the Razorpay payment ID from your
        receipt helps). We reply within 2 business days.
      </p>

      <h2>When you get your money</h2>
      <p>
        Approved refunds are issued through Razorpay to the original payment method within <strong>5–7 business days</strong>. Your bank or card issuer
        may take a few more days to show it. Refunds are made in the currency of the payment; we cannot control exchange-rate differences or fees
        charged by your bank. Once a refund is issued, the plan it paid for ends.
      </p>
    </LegalDoc>
  )
}

export function ShippingPage() {
  return (
    <LegalDoc eyebrow="Billing" title="Shipping & delivery policy" intro={`${PRODUCT} is a digital service. Nothing is shipped.`}>
      <h2>Digital delivery</h2>
      <p>
        {PRODUCT} plans are delivered online. No physical goods are shipped, and there are no shipping charges.
      </p>

      <h2>When you get access</h2>
      <ul>
        <li>
          <strong>Standard and SI plans</strong> are activated on your account <strong>immediately</strong> after your payment is confirmed by Razorpay —
          usually within a few seconds. You will see the active plan and its end date on your <Link to="/account">account page</Link>.
        </li>
        <li>
          The <strong>web app</strong> is available right away at <a href={`${SITE_URL}/app`}>{SITE_URL.replace('https://', '')}/app</a>. The{' '}
          <strong>Mac app</strong> can be downloaded from the website at any time.
        </li>
      </ul>

      <h2>If something goes wrong</h2>
      <p>
        If your payment succeeded but the plan is not active within 30 minutes, open your account page (it re-checks pending payments automatically). If
        it is still not active, send us your Razorpay payment ID through the <Contact /> and we will activate it or refund you.
      </p>
    </LegalDoc>
  )
}

export function CookiesPage() {
  return (
    <LegalDoc eyebrow="Legal" title="Cookie policy" intro="We use only what the service needs to work. No advertising or analytics trackers.">
      <h2>What we use</h2>
      <table>
        <thead>
          <tr>
            <th>Name / storage</th>
            <th>Purpose</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>reflex.auth (local storage)</td>
            <td>Keeps you signed in to your account</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>reflex.settings (local storage)</td>
            <td>Your teleprompter and presenting settings</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>Presentations (IndexedDB)</td>
            <td>Your decks, scripts and notes, on your device</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>Speech model (Cache Storage)</td>
            <td>The downloaded on-device speech model, so it isn't downloaded again</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>reflex.cookieNotice (local storage)</td>
            <td>Remembers that you have seen the cookie notice</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>Razorpay cookies</td>
            <td>Set by Razorpay inside the payment window, for fraud prevention and to complete payments</td>
            <td>Essential (third party, only when paying)</td>
          </tr>
        </tbody>
      </table>

      <h2>No tracking</h2>
      <p>We do not use advertising cookies, cross-site trackers or third-party analytics.</p>

      <h2>Your choices</h2>
      <p>
        Because these are essential for signing in, paying and saving your work, the service does not work properly without them. You can clear them at
        any time in your browser settings; clearing site data also deletes presentations stored in that browser. Razorpay's own cookies are described
        in Razorpay's privacy policy.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Use the <Contact />.
      </p>
    </LegalDoc>
  )
}
