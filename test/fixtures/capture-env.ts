process.stdout.write(
  JSON.stringify({
    invocation: process.env["AGENTROLES_INVOCATION_ID"],
    harness: process.env["AGENTROLES_HARNESS"],
    role: process.env["AGENTROLES_ROLE"],
    name: process.env["AGENTROLES_NAME"],
  }),
);
