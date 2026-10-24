// Minimal createServerFn: the built chain becomes a plain async function that
// runs the validator and then the handler, so tests can call server functions
// the way the framework does: `fn({ data })`.
export function createServerFn() {
  let validate = (input) => input;
  const chain = {
    validator(fn) {
      validate = typeof fn === "function" ? fn : (input) => fn.parse(input);
      return chain;
    },
    inputValidator(fn) {
      return chain.validator(fn);
    },
    handler(fn) {
      return (input) => fn({ data: validate(input?.data) });
    },
  };
  return chain;
}
