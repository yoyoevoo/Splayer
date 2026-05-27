declare const __BUILD_DATE__: string;

declare module "jsmediatags/dist/jsmediatags.min.js" {
  interface Picture {
    data: number[];
    format: string;
    type?: string;
    description?: string;
  }
  interface Tags {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    track?: string;
    genre?: string;
    picture?: Picture;
    [key: string]: unknown;
  }
  interface TagResult {
    type: string;
    tags: Tags;
  }
  interface Callbacks {
    onSuccess: (result: TagResult) => void;
    onError: (error: { type: string; info: string }) => void;
  }
  const jsmediatags: {
    read(file: Blob | File | string, callbacks: Callbacks): void;
    Reader: unknown;
  };
  export default jsmediatags;
}
