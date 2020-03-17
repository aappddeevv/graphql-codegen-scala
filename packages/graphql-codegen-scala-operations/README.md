# graphql-codegen-scala

A scala code generator for the @graphql-codegen toolchain.

Development of code generators seems to have shifted from the
base apollo tools to this plugin. @graphql-codgen uses the
concept of plugins to allow you to layer on different codegen
tasks to achieve the desired output.

This codegen is currently focused on generating code for
scala.js frontends. To install you need to use the bintray
registry as shown below.

```sh
npm -i -D @graphql-codegen/cli @graphql-codegen/add
npm install @aappddeevvv/graphql-code-scala-operations --registry https://api.bintray.com/npm/aappddeevv/npm
```

You should use the other @graphql-codgen plugins to achieve
the desired output package:

```yml
# yml configuration
schema: "schema.json" // queried from server via a graphql CLI
# or
schema: "schema.graphql" // raw graphql
documents: "awesome_sub_project/src/main/graphql/*.graphql
generates:
  awesome_sub_project/target/scala-2.13/src_managed/main/cli_codegen/graphql.scala
    plugins:
      - "@aappddeevv/graphql-codgen-scala-operations"
      - add: "// DO NOT EDIT"
      - add: "package awesome"
    config:
      gqlImport: "apollo_boost._#gql
    hooks:
      afterOneFileWrite:
        - scalafmt
```

You only need the scalafmt hook if you want to read clean sources.
Skipping gqlImport means that the documents are not inlined into
the operation objects. `apollo_boost` is scala.js published package
that has a `gql` function that takes a string and produces a
graphql `DocumentNode` via the graphql packages written in
javascript and facaded by the `apollo_boost` scala.js facade.

## Options

* gqlImport: Scala package import and "gql" function to turn a string into a
graphql DocumentNode. Depending on the scala.js facade you are using, this
could be different. If the option is not provided, only the operation strings
are embedded in the output.

# Limitations

Code generation does not handle:

- unions, union extensions
- inline fragment spreads
- enum extensions
- default values
- other things buried deep in the graphql spec...

# sbt

You will want to generate your sources directly into
the src_generated directory of your project and then
ensure that the contents are watched. You can have this codegen
automatically triggered by using the `sbt-cli-codgen`
plugin and simply configuring it to run when the sources
change.

Install the `sbt-cli-codegen` plugin into project/plugins.sbt, then:

```
// build.sbt
mycommand = (files: Seq[String]) => (Seq("npx", "graphql-codegen"), Seq("graphql.scala"))
lazy val proja = project.in(file("proja"))
  .enablePlugins(CLICodgenPlugin)
  .settings(
     // optional: watch the codegen config file itself
     watchSources += baseDirectory.value / "codegen.yml",
     codegenCommand := mycommand,
     // In this case, you could also add the schema.json file since the codegen config is independent
     // of the scala config.
     codegenInputSources := Seq(sourceDirectory.value.toGlob / "proja/src/main/graphql/*.graphql")
  )
```

The above config assumes a few sbt-cli-codegen defaults. `mycommand` formulates the
command to be run and the output file. If you need to insert content from sbt into
the yaml config file, you could perform a side-effect inside the function.

You can use sbt to trigger a re-run or use the watch flag on @graphql-codegen.

# Evolution

The codegen plugin does not handle all graphql constructs and is in a state of
flux while it adds more graphql capabilities.
