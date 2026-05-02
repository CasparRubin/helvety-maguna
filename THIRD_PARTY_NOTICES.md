# Third-party notices

This project includes or depends on the following notable components. See each link for full license text.

| Component                                                                                                                  | License                 | Notes                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| [Tauri](https://github.com/tauri-apps/tauri)                                                                               | MIT / Apache-2.0 (dual) | Application shell                                  |
| [llama.cpp](https://github.com/ggerganov/llama.cpp) (via `llama_cpp` / `llama_cpp_sys` when built with `--features llama`) | MIT                     | On-device inference                                |
| [React](https://github.com/facebook/react)                                                                                 | MIT                     | UI                                                 |
| [Vite](https://github.com/vitejs/vite)                                                                                     | MIT                     | Frontend tooling                                   |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)                                                                | MIT                     | Styling                                            |
| [Radix UI](https://www.radix-ui.com/) primitives                                                                           | MIT                     | Accessible UI primitives (shadcn-style components) |
| [reqwest](https://github.com/seanmonstar/reqwest)                                                                          | MIT / Apache-2.0        | HTTPS downloads in Rust                            |
| [rustls](https://github.com/rustls/rustls)                                                                                 | Apache-2.0 / ISC / MIT  | TLS for HTTP client                                |

**Model weights** are end-user downloads and are **not** shipped as part of the application source. Each catalog entry documents a license note and links to the upstream model card (for example on Hugging Face). Users are responsible for complying with the license of each weight file they install.
