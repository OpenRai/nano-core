declare module 'nano-rspow-web' {
  export interface GenerateResult {
    readonly nonce: string;
  }

  export function generate_work(root: string, threshold: string): Promise<GenerateResult>;
  export function validate_work(root: string, work: string, threshold: string): boolean;
  export default function init(): Promise<unknown>;
}
