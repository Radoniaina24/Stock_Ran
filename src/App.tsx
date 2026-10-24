import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col text-slate-700">
      <section
        id="center"
        className="flex flex-grow flex-col items-center justify-center gap-6 px-5 py-20 text-center"
      >
        <div className="relative flex items-end justify-center">
          <img src={heroImg} className="w-[170px]" width="170" height="179" alt="" />
          <img
            src={reactLogo}
            className="absolute top-8 h-7 [transform:perspective(2000px)_rotate(300deg)_rotateX(44deg)_rotateY(39deg)_scale(1.4)]"
            alt="React logo"
          />
          <img
            src={viteLogo}
            className="absolute top-[107px] h-6 [transform:perspective(2000px)_rotate(300deg)_rotateX(40deg)_rotateY(39deg)_scale(0.8)]"
            alt="Vite logo"
          />
        </div>

        <div>
          <h1 className="text-4xl font-medium tracking-tight text-slate-900 md:text-5xl">
            Get started
          </h1>
          <p className="mt-3 text-slate-500">
            Edit <code className="rounded bg-slate-100 px-2 py-1 text-sm">src/App.tsx</code> and
            save to test <code className="rounded bg-slate-100 px-2 py-1 text-sm">HMR</code>
          </p>
        </div>

        <button
          type="button"
          className="cursor-pointer rounded-md border-2 border-transparent bg-purple-500/10 px-4 py-2 text-base text-purple-600 transition-colors hover:border-purple-500/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      <section id="next-steps" className="flex border-t border-slate-200 text-left max-md:flex-col">
        <div className="flex-1 border-r border-slate-200 p-8 max-md:border-r-0 max-md:border-b">
          <svg className="mb-4 h-[22px] w-[22px]" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2 className="text-2xl font-medium text-slate-900">Documentation</h2>
          <p className="mt-1 text-slate-500">Your questions, answered</p>
          <ul className="mt-8 flex flex-wrap gap-2">
            <li>
              <a
                href="https://vite.dev/"
                target="_blank"
                className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-slate-900 transition-shadow hover:shadow-md"
              >
                <img className="h-[18px]" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a
                href="https://react.dev/"
                target="_blank"
                className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-slate-900 transition-shadow hover:shadow-md"
              >
                <img className="h-[18px]" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>

        <div className="flex-1 p-8">
          <svg className="mb-4 h-[22px] w-[22px]" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2 className="text-2xl font-medium text-slate-900">Connect with us</h2>
          <p className="mt-1 text-slate-500">Join the Vite community</p>
          <ul className="mt-8 flex flex-wrap gap-2">
            <li>
              <a
                href="https://github.com/vitejs/vite"
                target="_blank"
                className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-slate-900 transition-shadow hover:shadow-md"
              >
                <svg className="h-[18px] w-[18px]" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a
                href="https://chat.vite.dev/"
                target="_blank"
                className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-slate-900 transition-shadow hover:shadow-md"
              >
                <svg className="h-[18px] w-[18px]" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#chat-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a
                href="https://x.com/vite_js"
                target="_blank"
                className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-slate-900 transition-shadow hover:shadow-md"
              >
                <svg className="h-[18px] w-[18px]" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a
                href="https://bsky.app/profile/vite.dev"
                target="_blank"
                className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-slate-900 transition-shadow hover:shadow-md"
              >
                <svg className="h-[18px] w-[18px]" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}

export default App
