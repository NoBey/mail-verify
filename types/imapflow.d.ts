declare module 'imapflow' {
  export class ImapFlow {
    constructor(config: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
      logger: boolean;
    });

    connect(): Promise<void>;
    getMailboxLock(mailbox: string): Promise<{ release: () => void }>;
    mailboxOpen(mailbox: string): Promise<{ exists: number }>;
    fetch(sequence: string, options: {
      envelope?: boolean;
      bodyStructure?: boolean;
      source?: boolean;
      uid?: boolean;
    }): AsyncIterable<{
      uid: number;
      source: Buffer;
    }>;
    idle(): Promise<{ stop: () => void }>;
    noop(): Promise<void>;

    on(event: 'error', callback: (err: Error) => void): void;
    on(event: 'close', callback: () => void): void;
    on(event: 'exists', callback: (data: { count: number }) => void): void;
  }
} 