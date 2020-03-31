# graphql-codegen-scala-schema

Generate scala code from the schema.

This is a prototype code generator for generating types from the schema and may not generate anything useful for
your application. Check back soon or you can try and see if it is helpful.

## Code Generation

By default this generates:

* Input traits as scala.js, non-native traits. Input optional types use null, which is how they are specified in graphql.
* Interfaces have no companion objects.
* Types that inherit from interfaces have companion methods that take into account that type's properties as well as properties from interfaces.

## Options

* separateInterfaces: boolean. Types will have interfaces factored out. If true, separate traits are generated and
inheritance is used. false means that traits have all the fields in them directly. Default is true.

# Installing

The packages are published to bintray. To install:

```sh
npm install @aappddeevvv/graphql-code-scala-schema --registry https://api.bintray.com/npm/aappddeevv/npm
```
