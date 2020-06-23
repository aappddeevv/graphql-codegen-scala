[![GitHub version](https://badge.fury.io/gh/aappddeevv%2Fgraphql-codegen-scala.svg)](https://badge.fury.io/gh/aappddeevv%2Fgraphql-codegen-scala)

# scala.js suppport for @graphql-codegen

[@graphql-codgen](https://graphql-code-generator.com) is a plugin driven ecosystem
of graphql code generators. It differs from the code generators included in the
[apollo](https://www.apollographql.com/) platform.

These packages take a schema first approach versus a code first approach like
[caliban](https://ghostdogpr.github.io/caliban). There are multiple code generators depending on what you want to generate.

- @aappddeevv/graphql-codegen-scala-operations: Generate "client" operation code.
- @aappddeevv/graphql-codegen-scala-schema: Generate schema type code typically for the "server."
  - Prototype only.

You use the plugins like any other for @graphql-codgen so please see the instructions
for that project.

The code generators create scala code that uses only basic scala.js constructs so there are
no additional libraries to import. The generated code uses `js.Array`, `js.UndefOr`, and `T | Null`
to translate graphql language constructs to scala.js code. You will probably want to use
implicit conversions to help manage the data wrangling for your code.

This is a new project and the graphql spec is not fully supported. The current focus is
on generating operations for the client with the target being the apollo graphql client
although there is nothing specific to apollo in the generated code.

There is a package called `@aappddeevv/graphql-codegen-scala` on npm. Ignore it and
use the npm packages listed above using the registry option listed below.

# Install

The npm packages are currently published to bintray. To install use:

- `npm install <PACKAGE_NAME> --registry https://dl.bintray.com/npm/aappddeevv/npm`

So:

```sh
npm install -D @graphql-codegen/visitor-plugin-common
npm install -D @aappddeevvv/graphql-codegen-scala-operations --registry https://dl.bintray.com/npm/aappddeevv/npm --registry https://registry.npmjs.org
npm install -D @aappddeevvv/graphql-codegen-scala-schema --registry https://dl.bintray.com/npm/aappddeevv/npm --registry https://registry.npmjs.org
```

# Options

Each plugin has a few options. Please see those READMEs for details.

# License

[![GitHub license](https://img.shields.io/badge/license-MIT-lightgrey.svg?maxAge=2592000)](https://raw.githubusercontent.com/aappddeevv/graphql-codegen-scala/master/LICENSE)

MIT
