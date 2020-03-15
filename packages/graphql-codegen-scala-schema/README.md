# graphql-codegen-scala-schema

Generate scala code from the schema.

This is a prototype code generator for generating types from the schema and may not generate anything useful for
your application. Check back soon or you can try and see if it is helpful.

Options:

* separateInterfaces: boolean. Types will have interfaces factored out. If true, separate traits are generated and
inheritance is used. false means that traits have all the fields in them directly.

# Installing

The packages are published to bintray. To install:

```sh
npm install @aappddeevvv/graphql-code-scala-schema --registry https://api.bintray.com/npm/aappddeevv/npm
```
