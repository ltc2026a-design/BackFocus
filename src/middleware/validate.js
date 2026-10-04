import { ApiError } from "../utils/errors.js";

// Middleware de validación con zod. `sources` = { body?, query?, params? }
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });
  if (!result.error) {
    if (result.data.body !== undefined) req.body = result.data.body;
    if (result.data.query !== undefined) req.validatedQuery = result.data.query;
    if (result.data.params !== undefined) req.params = result.data.params;
    return next();
  }
  const first = result.error.issues[0];
  const path = first?.path?.join(".") || "input";
  next(new ApiError(400, "VALIDATION_ERROR", `${path}: ${first?.message ?? "inválido"}`));
};
