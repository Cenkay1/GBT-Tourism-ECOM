// better-sqlite3 paketi kendi TypeScript tiplerini getirmiyor ve
// @types/better-sqlite3 kurulu değil. Bu dosya yalnızca testlerin ihtiyaç
// duyduğu yüzeyi tanımlayan geçici bir shim'dir — @types/better-sqlite3
// kurulursa çifte tanım çakışmasını önlemek için BU DOSYA SİLİNMELİ.
declare module "better-sqlite3" {
  interface Statement<R = unknown> {
    all(...params: unknown[]): R[];
    get(...params: unknown[]): R | undefined;
    run(...params: unknown[]): { changes: number };
  }

  class Database {
    constructor(filename: string);
    prepare(sql: string): Statement;
    exec(sql: string): this;
    close(): void;
  }

  namespace Database {
    interface Database {
      prepare(sql: string): Statement;
      exec(sql: string): Database;
      close(): void;
    }
  }

  export = Database;
}
