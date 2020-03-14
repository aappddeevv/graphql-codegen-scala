# graphql-codegen-scala-common

Common code for the other modules.

In order to simplify processing, an Intermediate Representation (IR) is created and the
AST is treated is immutable. The IR greatly simplifies processing and allows us to
render to a variety of target languages and rendering approaches without forcing
these decisions prematurely. Of course, we are mostly interested in scala.

# Install

```sh
npm install @aappddeevvv/graphql-code-scala-common --registry https://api.bintray.com/npm/aappddeevv/npm
```
