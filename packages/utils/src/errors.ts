abstract class BaseError extends Error {
  statusCode: number = -1;

  constructor(msg: string) {
    super(msg);
    this.name = "BaseError";
  }
}

export class RlBadRequestError extends BaseError {
  statusCode = 400;

  constructor(msg: string = "Bad request") {
    super(msg);
  }
}

export class RlUnauthorizedError extends BaseError {
  statusCode = 401;

  constructor(msg: string = "Unauthorized") {
    super(msg);
  }
}

export class RlForbiddenError extends BaseError {
  statusCode = 403;

  constructor(msg: string = "Forbidden") {
    super(msg);
  }
}

export class RlNotFoundError extends BaseError {
  statusCode = 404;

  constructor(msg: string = "Not found") {
    super(msg);
  }
}

export class RlConflictError extends BaseError {
  statusCode = 409;

  constructor(msg: string = "Conflict") {
    super(msg);
  }
}

export class RlInvalidDataError extends BaseError {
  statusCode = 422;

  constructor(msg: string = "Invalid data") {
    super(msg);
  }
}

export class RlInternalError extends BaseError {
  statusCode = 500;

  constructor(msg: string = "Internal server error") {
    super(msg);
  }
}
