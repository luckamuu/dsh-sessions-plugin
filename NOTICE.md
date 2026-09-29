# Third-party notices

This repository's own code is [MIT licensed](LICENSE).

## Verification stand-in

`test/stubs/dsh-typert-protocol.mjs` contains logic derived from
**`@deepseek-ai/dsh-typert-protocol` 0.2.0-rc.1**, which ships inside the
DeepSeek Harness application archive under the MIT license:

```
MIT License

Copyright (c) 2026 DeepSeek
```

The stand-in exists so that this plugin's Remote method contract (markers,
descriptor shape, source-mode parameter naming) can be verified without a
Harness installation present. Only the small descriptor-reading helpers are
reproduced; the rest of the package is not needed here.

`test/run.mjs` additionally contains two short helpers copied verbatim from
`@deepseek-ai/dsh-api-gateway` (also MIT, © 2026 DeepSeek): the source-mode
method-parameter parser and the Remote binding validator. They are duplicated
on purpose — the suite asserts the plugin against the exact code the Host runs,
not against a paraphrase of it.

The full upstream license texts are available in those packages inside the
Harness installation.