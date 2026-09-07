abstract class BaseError extends Error {
  statusCode: number = -1;

  constructor(msg: string) {
    super(msg);
    this.name = "BaseError";
  }
}

export class RlInvalidDataError extends BaseError {
  statusCode = 422;

  constructor(msg: string = "Invalid data") {
    super(msg);
  }
}
