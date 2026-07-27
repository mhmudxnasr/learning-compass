var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app8) {
    const subApp = this.basePath(path);
    app8.routes.map((r) => {
      let handler;
      if (app8.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app8.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = /* @__PURE__ */ __name((children) => {
  for (const _ in children) {
    return true;
  }
  return false;
}, "hasChildren");
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = /* @__PURE__ */ __name((options) => {
  const opts = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return /* @__PURE__ */ __name(async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    __name(set, "set");
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  }, "cors2");
}, "cors");

// src/lib.ts
var VALID_STATUS = /* @__PURE__ */ new Set(["active", "consumed", "rejected"]);
var VALID_RATINGS = /* @__PURE__ */ new Set(["unset", "love", "like", "meh", "dislike"]);
var isValidUrl = /* @__PURE__ */ __name((u) => typeof u === "string" && u.length > 0 && u.length < 2048 && /^https?:\/\/[^\s<>"']+$/i.test(u), "isValidUrl");
var isNonEmptyStr = /* @__PURE__ */ __name((v, max = 5e3) => typeof v === "string" && v.length > 0 && v.length <= max, "isNonEmptyStr");
var escapeHtml = /* @__PURE__ */ __name((s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "escapeHtml");
var safeError = /* @__PURE__ */ __name((fallback) => (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[err]", msg);
  return { error: fallback };
}, "safeError");

// src/api/recommendations.ts
var app = new Hono2();
app.get("/list", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  const status = c.req.query("status");
  const q = c.req.query("q");
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50"), 1), 200);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);
  const contentType = c.req.query("content_type");
  const rating = c.req.query("rating");
  const creator = c.req.query("creator");
  const since = c.req.query("since");
  const where = [];
  const bindings = [];
  if (status) {
    if (!VALID_STATUS.has(status)) return c.json({ error: "invalid status" }, 400);
    where.push("status = ?");
    bindings.push(status);
  }
  if (contentType) {
    where.push("content_type = ?");
    bindings.push(contentType);
  }
  if (rating) {
    if (!VALID_RATINGS.has(rating)) return c.json({ error: "invalid rating" }, 400);
    where.push("user_rating = ?");
    bindings.push(rating);
  }
  if (creator) {
    where.push("creator LIKE ?");
    bindings.push(`%${creator}%`);
  }
  if (since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return c.json({ error: "invalid since date" }, 400);
    where.push("created_at >= ?");
    bindings.push(since);
  }
  if (q) {
    where.push("(video_title LIKE ? OR creator LIKE ? OR why_this LIKE ?)");
    const like = `%${q}%`;
    bindings.push(like, like, like);
  }
  const whereClause = where.length > 0 ? " WHERE " + where.join(" AND ") : "";
  try {
    const [rows, countRow] = await Promise.all([
      DB.prepare(`SELECT * FROM recommendations${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all(),
      DB.prepare(`SELECT COUNT(*) as c FROM recommendations${whereClause}`).bind(...bindings).first()
    ]);
    return c.json({ recommendations: rows.results, total: countRow?.c || 0, limit, offset });
  } catch (err) {
    return c.json(safeError("List failed")(err), 500);
  }
});
app.post("/push", async (c) => {
  const { DB } = c.env;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const items = Array.isArray(body) ? body : [body];
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const stmts = [];
  try {
    for (const item of items) {
      if (!item.video_title || !item.video_url) continue;
      if (!isNonEmptyStr(item.video_title, 500)) continue;
      if (!isValidUrl(item.video_url)) continue;
      if (item.status && !VALID_STATUS.has(item.status)) continue;
      if (item.user_rating && !VALID_RATINGS.has(item.user_rating)) continue;
      const id = item.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const dedupKey = item.dedup_key || `key_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      stmts.push(
        DB.prepare(
          `INSERT INTO recommendations (
            id, video_title, creator, content_type, video_url, why_this, verified, status,
            user_rating, user_review, dedup_key, synergy_bundle_id, consumed_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(dedup_key) DO UPDATE SET
            video_title = excluded.video_title,
            creator = excluded.creator,
            content_type = excluded.content_type,
            video_url = excluded.video_url,
            why_this = excluded.why_this,
            verified = excluded.verified,
            status = excluded.status,
            user_rating = excluded.user_rating,
            user_review = excluded.user_review,
            synergy_bundle_id = excluded.synergy_bundle_id,
            consumed_date = excluded.consumed_date`
        ).bind(
          id,
          item.video_title,
          item.creator || null,
          item.content_type || null,
          item.video_url,
          item.why_this || null,
          item.verified || today,
          item.status || "active",
          item.user_rating || "unset",
          item.user_review || null,
          dedupKey,
          item.synergy_bundle_id || "unset",
          item.consumed_date || "unset"
        )
      );
    }
    if (stmts.length === 0) return c.json({ ok: true, count: 0 });
    await DB.batch(stmts);
  } catch (err) {
    return c.json(safeError("Push failed")(err), 500);
  }
  return c.json({ ok: true, count: items.length });
});
app.post("/action", async (c) => {
  const { DB } = c.env;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!body.status) {
    return c.json({ error: "status required" }, 400);
  }
  if (!VALID_STATUS.has(body.status)) {
    return c.json({ error: "invalid status" }, 400);
  }
  if (body.user_rating && !VALID_RATINGS.has(body.user_rating)) {
    return c.json({ error: "invalid rating" }, 400);
  }
  if (body.user_review && !isNonEmptyStr(body.user_review, 5e3)) {
    return c.json({ error: "review too long" }, 400);
  }
  const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (ids.length === 0) return c.json({ error: "id or ids required" }, 400);
  for (const id of ids) {
    if (!isNonEmptyStr(id, 100)) return c.json({ error: "invalid id" }, 400);
  }
  const consumedDate = body.status === "consumed" ? body.consumed_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0] : null;
  try {
    const stmts = ids.map((id) => DB.prepare(
      `UPDATE recommendations
       SET status = ?,
           user_rating = COALESCE(?, user_rating),
           user_review = COALESCE(?, user_review),
           consumed_date = COALESCE(?, consumed_date)
       WHERE id = ?`
    ).bind(
      body.status,
      body.user_rating || null,
      body.user_review || null,
      consumedDate,
      id
    ));
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
  } catch (err) {
    return c.json(safeError("Action failed")(err), 500);
  }
  return c.json({ ok: true, count: ids.length });
});
app.post("/delete", async (c) => {
  const { DB } = c.env;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!body.id) {
    return c.json({ error: "id required" }, 400);
  }
  if (!isNonEmptyStr(body.id, 100)) {
    return c.json({ error: "id required" }, 400);
  }
  try {
    await DB.prepare("DELETE FROM recommendations WHERE id = ?").bind(body.id).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Delete failed")(err), 500);
  }
});
app.get("/check-blacklist", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  const q = (c.req.query("q") || "").trim();
  if (!q || q.length < 2) return c.json({ matches: [] });
  const like = `%${q}%`;
  try {
    const res = await DB.prepare(
      `SELECT id, name, work, reason, severity FROM blacklist
       WHERE name LIKE ? OR work LIKE ?
       ORDER BY severity ASC LIMIT 8`
    ).bind(like, like).all();
    return c.json({ matches: res.results || [] });
  } catch (err) {
    return c.json(safeError("Blacklist check failed")(err), 500);
  }
});
app.get("/export", async (c) => {
  const { DB } = c.env;
  const format = c.req.query("format") || "json";
  try {
    const result = await DB.prepare("SELECT * FROM recommendations ORDER BY created_at DESC").all();
    const items = result.results || [];
    if (format === "md") {
      const header = "| Title | Creator | URL | Why | Status | Rating | Review | Tags |\n| --- | --- | --- | --- | --- | --- | --- | --- |";
      const rows = items.map(
        (i) => `| ${i.video_title} | ${i.creator || ""} | ${i.video_url} | ${i.why_this || ""} | ${i.status} | ${i.user_rating || ""} | ${i.user_review || ""} | ${i.synergy_bundle_id || ""} |`
      ).join("\n");
      return new Response(header + "\n" + rows, {
        headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="taste-map-export.md"' }
      });
    }
    return c.json({ exported_at: (/* @__PURE__ */ new Date()).toISOString(), total: items.length, recommendations: items });
  } catch (err) {
    return c.json(safeError("Export failed")(err), 500);
  }
});
var recommendations_default = app;

// src/api/brain.ts
var app2 = new Hono2();
app2.get("/node/:id", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  const id = c.req.param("id");
  try {
    const row = await DB.prepare("SELECT * FROM tree_nodes WHERE id = ?").bind(id).first();
    if (!row) return c.json({ error: "not found" }, 404);
    let x = null, y = null;
    try {
      if (row.meta_json) {
        const m = JSON.parse(row.meta_json);
        if (typeof m.x === "number") x = m.x;
        if (typeof m.y === "number") y = m.y;
      }
    } catch {
    }
    const node = { ...row, x, y, meta_json: void 0 };
    const children = await DB.prepare(
      "SELECT id, type, label, status, super_category, meta_json FROM tree_nodes WHERE parent_id = ? ORDER BY type, id"
    ).bind(id).all();
    const childrenParsed = (children.results || []).map((c2) => {
      let cx = null, cy = null;
      try {
        const m = JSON.parse(c2.meta_json || "{}");
        cx = m.x;
        cy = m.y;
      } catch {
      }
      return { ...c2, x: cx, y: cy, meta_json: void 0 };
    });
    const siblings = await DB.prepare(
      "SELECT id, type, label, status FROM tree_nodes WHERE parent_id = ? AND id != ? ORDER BY id"
    ).bind(node.parent_id || "root", id).all();
    const recs = await DB.prepare(
      "SELECT id, video_title, creator, user_rating, status, consumed_date, dedup_key FROM recommendations WHERE dedup_key LIKE ? ORDER BY consumed_date DESC"
    ).bind(id + "-%").all();
    const parents = [];
    let cur = node;
    while (cur && cur.parent_id) {
      const p = await DB.prepare("SELECT id, type, label, status, parent_id, meta_json FROM tree_nodes WHERE id = ?").bind(cur.parent_id).first();
      if (p) {
        let px = null, py = null;
        try {
          const m = JSON.parse(p.meta_json || "{}");
          px = m.x;
          py = m.y;
        } catch {
        }
        parents.push({ ...p, x: px, y: py, meta_json: void 0 });
        cur = p;
      } else break;
    }
    return c.json({ node, children: childrenParsed, siblings: siblings.results || [], related_recs: recs.results || [], parents });
  } catch (err) {
    return c.json(safeError("Node failed")(err), 500);
  }
});
app2.get("/profile", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  try {
    const profile = await DB.prepare("SELECT * FROM profile WHERE id = 1").first();
    const priorities = await DB.prepare("SELECT * FROM priorities ORDER BY rank ASC").all();
    const mastered = await DB.prepare("SELECT * FROM mastered ORDER BY mastered_at DESC").all();
    const blacklist = await DB.prepare("SELECT * FROM blacklist ORDER BY severity ASC, added_at DESC").all();
    const patterns = await DB.prepare("SELECT * FROM patterns ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, confirmed_date DESC").all();
    const recent = await DB.prepare("SELECT * FROM update_log ORDER BY id DESC LIMIT 10").all();
    return c.json({
      profile: profile || null,
      priorities: priorities.results || [],
      mastered: mastered.results || [],
      blacklist: blacklist.results || [],
      patterns: patterns.results || [],
      recent: recent.results || []
    });
  } catch (err) {
    return c.json(safeError("Profile failed")(err), 500);
  }
});
app2.get("/tree", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  try {
    const result = await DB.prepare("SELECT id, type, label, status, super_category, parent_id, meta_json FROM tree_nodes ORDER BY id").all();
    const nodes = (result.results || []).map((r) => {
      let x = null, y = null;
      try {
        if (r.meta_json) {
          const m = JSON.parse(r.meta_json);
          if (typeof m.x === "number") x = m.x;
          if (typeof m.y === "number") y = m.y;
        }
      } catch {
      }
      return { id: r.id, type: r.type, label: r.label, status: r.status, super_category: r.super_category, parent_id: r.parent_id, x, y };
    });
    return c.json({ nodes, count: nodes.length });
  } catch (err) {
    return c.json(safeError("Tree failed")(err), 500);
  }
});
app2.get("/branches", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  try {
    const result = await DB.prepare("SELECT super_category, status, COUNT(*) as c FROM tree_nodes WHERE type IN ('branch','leaf') GROUP BY super_category, status").all();
    return c.json({ groups: result.results || [] });
  } catch (err) {
    return c.json(safeError("Branches failed")(err), 500);
  }
});
app2.get("/resurfacing", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  try {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const due = await DB.prepare(
      "SELECT r.*, rec.video_title, rec.creator, rec.user_rating FROM resurfacing r LEFT JOIN recommendations rec ON rec.id = r.recommendation_id WHERE r.resolved_at IS NULL AND r.due_at <= ? ORDER BY r.due_at ASC"
    ).bind(today).all();
    return c.json({ due: due.results || [], today });
  } catch (err) {
    return c.json(safeError("Resurfacing failed")(err), 500);
  }
});
app2.get("/contradictions", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  try {
    const result = await DB.prepare("SELECT * FROM contradictions WHERE resolved_at IS NULL ORDER BY detected_at DESC").all();
    return c.json({ contradictions: result.results || [] });
  } catch (err) {
    return c.json(safeError("Contradictions failed")(err), 500);
  }
});
app2.get("/health", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  try {
    const byBranch = await DB.prepare(`
      SELECT
        COALESCE(SUBSTR(dedup_key, 1, INSTR(dedup_key, '-') - 1), 'root') as branch,
        COUNT(*) as consumed_count,
        AVG(CASE WHEN user_rating GLOB '[0-9]*' THEN CAST(user_rating AS REAL) ELSE NULL END) as avg_rating,
        MAX(consumed_date) as last_consumed
      FROM recommendations
      WHERE status = 'consumed' AND dedup_key IS NOT NULL AND dedup_key != ''
      GROUP BY branch
      HAVING consumed_count > 0
      ORDER BY consumed_count DESC
    `).all();
    const stale = await DB.prepare(`
      SELECT id, video_title, verified, creator
      FROM recommendations
      WHERE status = 'active'
      AND verified != 'unset'
      AND julianday('now') - julianday(verified) > 30
      ORDER BY verified ASC
    `).all();
    const mastery = await DB.prepare(`
      SELECT
        COALESCE(SUBSTR(r.dedup_key, 1, INSTR(r.dedup_key, '-') - 1), 'root') as branch,
        SUM(CASE WHEN r.user_rating IN ('love','like') THEN 1 ELSE 0 END) as mastered,
        COUNT(*) as total
      FROM recommendations r
      WHERE r.status = 'consumed' AND r.dedup_key IS NOT NULL AND r.dedup_key != ''
      GROUP BY branch
    `).all();
    return c.json({
      byBranch: byBranch.results || [],
      stale: stale.results || [],
      mastery: mastery.results || [],
      stale_count: stale.results?.length || 0
    });
  } catch (err) {
    return c.json(safeError("Health failed")(err), 500);
  }
});
app2.post("/log", async (c) => {
  const { DB } = c.env;
  try {
    const { kind, summary, details } = await c.req.json();
    if (!summary) return c.json({ error: "summary required" }, 400);
    await DB.prepare(
      "INSERT INTO update_log (kind, summary, details_json) VALUES (?, ?, ?)"
    ).bind(kind || "system", summary, details ? JSON.stringify(details) : null).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Log failed")(err), 500);
  }
});
app2.post("/seed", async (c) => {
  const { DB } = c.env;
  try {
    const body = await c.req.json();
    const stmts = [];
    if (body.profile) {
      const p = body.profile;
      stmts.push(DB.prepare(`
        INSERT OR REPLACE INTO profile
        (id, identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, operational_style_json, patterns_summary_json, recent_signal, last_synced_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        p.identity || null,
        JSON.stringify(p.mega_priority || []),
        p.core_filter || null,
        p.reaction_style || null,
        p.quality_rules || null,
        p.operational_style || null,
        p.patterns_summary || null,
        p.recent_signal || null
      ));
    }
    if (Array.isArray(body.priorities)) {
      for (const [rank, branch_id, label] of body.priorities) {
        stmts.push(DB.prepare("INSERT OR REPLACE INTO priorities (rank, branch_id, label) VALUES (?, ?, ?)").bind(rank, branch_id, label));
      }
    }
    if (Array.isArray(body.tree_nodes)) {
      for (const n of body.tree_nodes) {
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO tree_nodes (id, type, label, super_category, parent_id, status, round_label, meta_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          n.id,
          n.type || "branch",
          n.label || n.id,
          n.super_category || null,
          n.parent_id || null,
          n.status || null,
          n.round_label || null,
          n.meta_json || (n.color ? JSON.stringify({ color: n.color, x: n.x, y: n.y, creator: n.creator, video_url: n.video_url, user_rating: n.user_rating, consumed_date: n.consumed_date }) : null)
        ));
      }
    }
    if (Array.isArray(body.mastered)) {
      for (const m of body.mastered) {
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO mastered (id, kind, label, author, rating, notes, mastered_at, decay_review_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT mastered_at FROM mastered WHERE id = ?), datetime('now')), COALESCE((SELECT decay_review_at FROM mastered WHERE id = ?), datetime('now', '+12 months')))
        `).bind(m[0], m[1], m[2], m[3] || null, m[4] || null, m[5] || null, m[0], m[0]));
      }
    }
    if (Array.isArray(body.blacklist)) {
      for (const b of body.blacklist) {
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO blacklist (id, name, work, reason, severity)
          VALUES (?, ?, ?, ?, ?)
        `).bind(b[0], b[1], b[2] || null, b[3] || null, b[4] || 3));
      }
    }
    if (Array.isArray(body.patterns_confirmed)) {
      for (const p of body.patterns_confirmed) {
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO patterns (id, description, evidence_json, confirmed_date, strength, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(p[0], p[1], JSON.stringify(p[2] || []), p[3] || null, p[4] || "confirmed", null));
      }
    }
    if (stmts.length === 0) return c.json({ ok: true, count: 0 });
    for (let i = 0; i < stmts.length; i += 50) {
      await DB.batch(stmts.slice(i, i + 50));
    }
    return c.json({ ok: true, count: stmts.length });
  } catch (err) {
    return c.json(safeError("Seed failed")(err), 500);
  }
});
app2.post("/pattern/strength", async (c) => {
  const { DB } = c.env;
  try {
    const { id, strength } = await c.req.json();
    if (!isNonEmptyStr(id, 100)) return c.json({ error: "id required" }, 400);
    if (!["weak", "confirmed", "locked"].includes(strength)) return c.json({ error: "invalid strength" }, 400);
    await DB.prepare("UPDATE patterns SET strength = ? WHERE id = ?").bind(strength, id).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Pattern strength failed")(err), 500);
  }
});
app2.post("/contradiction/resolve", async (c) => {
  const { DB } = c.env;
  try {
    const { id } = await c.req.json();
    if (!isNonEmptyStr(id, 100)) return c.json({ error: "id required" }, 400);
    await DB.prepare(`UPDATE contradictions SET resolved_at = datetime('now') WHERE id = ?`).bind(id).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Resolve failed")(err), 500);
  }
});
app2.post("/profile", async (c) => {
  const { DB } = c.env;
  try {
    const body = await c.req.json();
    const fields = [];
    const bindings = [];
    if (typeof body.core_filter === "string") {
      fields.push("core_filter = ?");
      bindings.push(body.core_filter);
    }
    if (body.mega_priority !== void 0) {
      fields.push("mega_priority_json = ?");
      bindings.push(JSON.stringify(body.mega_priority));
    }
    if (body.identity !== void 0) {
      fields.push("identity_json = ?");
      bindings.push(typeof body.identity === "string" ? body.identity : JSON.stringify(body.identity));
    }
    if (fields.length === 0) return c.json({ ok: true, count: 0 });
    fields.push("last_synced_at = datetime('now')");
    await DB.prepare(`UPDATE profile SET ${fields.join(", ")} WHERE id = 1`).bind(...bindings).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Profile update failed")(err), 500);
  }
});
app2.post("/priorities", async (c) => {
  const { DB } = c.env;
  try {
    const body = await c.req.json();
    if (!Array.isArray(body)) return c.json({ error: "array required" }, 400);
    const stmts = [DB.prepare("DELETE FROM priorities")];
    for (const p of body) {
      if (typeof p.rank !== "number" || !isNonEmptyStr(p.branch_id, 100)) continue;
      stmts.push(DB.prepare("INSERT INTO priorities (rank, branch_id, label) VALUES (?, ?, ?)").bind(p.rank, p.branch_id, p.label || null));
    }
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
    return c.json({ ok: true, count: body.length });
  } catch (err) {
    return c.json(safeError("Priorities update failed")(err), 500);
  }
});
var brain_default = app2;

// src/api/vault.ts
var app3 = new Hono2();
app3.get("/list", async (c) => {
  const { DB } = c.env;
  try {
    const result = await DB.prepare("SELECT id, filename, created_at, length(content) as size FROM html_files ORDER BY created_at DESC").all();
    return new Response(JSON.stringify({ files: result.results }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  } catch (err) {
    return c.json(safeError("List failed")(err), 500);
  }
});
app3.post("/upload", async (c) => {
  const { DB } = c.env;
  try {
    const { filename, content } = await c.req.json();
    if (!filename || !content) {
      return c.json({ error: "Filename and content required" }, 400);
    }
    if (!isNonEmptyStr(filename, 255)) {
      return c.json({ error: "Invalid filename" }, 400);
    }
    if (!isNonEmptyStr(content, 8 * 1024 * 1024)) {
      return c.json({ error: "Content too large (max 8MB)" }, 413);
    }
    const id = `html_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await DB.prepare("INSERT INTO html_files (id, filename, content) VALUES (?, ?, ?)").bind(id, filename, content).run();
    return c.json({ ok: true, id });
  } catch (err) {
    return c.json(safeError("Upload failed")(err), 500);
  }
});
app3.get("/download/:id", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  try {
    const file = await DB.prepare("SELECT filename, content FROM html_files WHERE id = ?").bind(id).first();
    if (!file) {
      return c.text("File not found", 404);
    }
    const isPdf = file.filename.endsWith(".pdf");
    const body = isPdf ? Uint8Array.from(atob(file.content), (c2) => c2.charCodeAt(0)) : file.content;
    return new Response(body, {
      headers: {
        "Content-Type": isPdf ? "application/pdf" : "text/html; charset=utf-8",
        "Content-Disposition": `${isPdf ? "inline" : "inline"}; filename="${encodeURIComponent(file.filename)}"`
      }
    });
  } catch (err) {
    console.error("[html/download]", err);
    return c.text("Download failed", 500);
  }
});
app3.post("/update/:id", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  try {
    const { filename, content } = await c.req.json();
    if (content === void 0 && filename === void 0) {
      return c.json({ error: "filename or content required" }, 400);
    }
    if (content !== void 0) {
      if (content.length === 0) {
        return c.json({ error: "Content cannot be empty" }, 400);
      }
      if (content.length > 8 * 1024 * 1024) {
        return c.json({ error: "Content too large (max 8MB)" }, 413);
      }
    }
    if (filename !== void 0 && !isNonEmptyStr(filename, 255)) {
      return c.json({ error: "Invalid filename" }, 400);
    }
    if (filename !== void 0 && content !== void 0) {
      await DB.prepare("UPDATE html_files SET filename = ?, content = ? WHERE id = ?").bind(filename, content, id).run();
    } else if (filename !== void 0) {
      await DB.prepare("UPDATE html_files SET filename = ? WHERE id = ?").bind(filename, id).run();
    } else {
      await DB.prepare("UPDATE html_files SET content = ? WHERE id = ?").bind(content, id).run();
    }
    return c.json({ ok: true, id });
  } catch (err) {
    return c.json(safeError("Update failed")(err), 500);
  }
});
app3.post("/delete", async (c) => {
  const { DB } = c.env;
  try {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "ID required" }, 400);
    if (!isNonEmptyStr(id, 100)) return c.json({ error: "ID required" }, 400);
    await DB.prepare("DELETE FROM html_files WHERE id = ?").bind(id).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Delete failed")(err), 500);
  }
});
app3.get("/print/:id", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  try {
    const file = await DB.prepare("SELECT filename, content FROM html_files WHERE id = ?").bind(id).first();
    if (!file) {
      return c.text("File not found", 404);
    }
    const safeFilename = escapeHtml(file.filename);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Print \u2014 ${safeFilename}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 15mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Literata', Georgia, 'Times New Roman', serif;
    font-size: 16px;
    line-height: 1.7;
    color: #1a1a1a;
    background: #fff;
    padding: 20px;
    max-width: 720px;
    margin: 0 auto;
    -webkit-font-smoothing: antialiased;
  }
  .print-toolbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: #1a1a1a;
    color: #fff;
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: system-ui, sans-serif;
    z-index: 9999;
  }
  .print-toolbar span { font-size: 14px; }
  .print-toolbar button {
    background: #fff;
    color: #1a1a1a;
    border: none;
    padding: 8px 20px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .print-toolbar button:hover { opacity: 0.9; }
  .print-content { margin-top: 60px; }

  @media print {
    .print-toolbar { display: none !important; }
    body { padding: 0; max-width: none; font-size: 11pt; }
    .print-content { margin-top: 0; }
    a { color: #000 !important; text-decoration: underline; word-wrap: break-word; }
    a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; }
    pre, code { background: #f5f5f5 !important; border: 1px solid #ddd; page-break-inside: avoid; font-size: 9pt; }
    h1, h2, h3, h4 { page-break-after: avoid; }
    img { max-width: 100% !important; page-break-inside: avoid; }
    section, .card, .block { break-inside: avoid; border: 1px solid #ccc !important; box-shadow: none !important; }
    p { orphans: 3; widows: 3; }
  }
</style>
</head>
<body>
<div class="print-toolbar no-print">
  <span>\u{1F5A8}\uFE0F ${safeFilename}</span>
  <button onclick="window.print()">Print / Save PDF</button>
</div>
<div class="print-content">
${file.content}
</div>
<script>
window.onload = function() {};
<\/script>
</body>
</html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } catch (err) {
    console.error("[html/print]", err);
    return c.text("Print view failed", 500);
  }
});
var vault_default = app3;

// src/api/learning.ts
var app4 = new Hono2();
app4.get("/heatmap", async (c) => {
  const { DB } = c.env;
  const yearAgo = /* @__PURE__ */ new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const startDate = yearAgo.toISOString().split("T")[0];
  try {
    const result = await DB.prepare(
      "SELECT date, count, topics FROM learning_log WHERE date >= ? ORDER BY date ASC"
    ).bind(startDate).all();
    const days = [];
    const rows = result.results || [];
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const r = row;
      map.set(r.date, { date: r.date, count: r.count, topics: r.topics || "" });
    }
    for (let d = new Date(yearAgo); d <= /* @__PURE__ */ new Date(); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0];
      if (map.has(key)) days.push(map.get(key));
      else days.push({ date: key, count: 0, topics: "" });
    }
    return c.json({ days });
  } catch (err) {
    return c.json(safeError("Heatmap failed")(err), 500);
  }
});
app4.post("/log", async (c) => {
  const { DB } = c.env;
  try {
    const { date, topics } = await c.req.json();
    const logDate = date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return c.json({ error: "invalid date format (YYYY-MM-DD)" }, 400);
    }
    const topicStr = (topics || "").slice(0, 2e3);
    await DB.prepare(
      `INSERT INTO learning_log (date, count, topics) VALUES (?, 1, ?)
       ON CONFLICT(date) DO UPDATE SET
         count = count + 1,
         topics = CASE
           WHEN ? != '' AND learning_log.topics != '' THEN learning_log.topics || ', ' || ?
           WHEN ? != '' THEN ?
           ELSE learning_log.topics
         END`
    ).bind(logDate, topicStr, topicStr, topicStr, topicStr, topicStr).run();
    return c.json({ ok: true, date: logDate });
  } catch (err) {
    return c.json(safeError("Log failed")(err), 500);
  }
});
app4.get("/detail", async (c) => {
  const { DB } = c.env;
  const date = c.req.query("date");
  const yearAgo = /* @__PURE__ */ new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const startDate = date || yearAgo.toISOString().split("T")[0];
  const endDate = date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  try {
    const result = await DB.prepare(
      "SELECT date, count, topics FROM learning_log WHERE date >= ? AND date <= ? ORDER BY date DESC"
    ).bind(startDate, endDate).all();
    return c.json({ days: result.results || [] });
  } catch (err) {
    return c.json(safeError("Detail failed")(err), 500);
  }
});
app4.post("/delete", async (c) => {
  const { DB } = c.env;
  try {
    const { date } = await c.req.json();
    if (!date) return c.json({ error: "date required" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "invalid date" }, 400);
    await DB.prepare("DELETE FROM learning_log WHERE date = ?").bind(date).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Delete failed")(err), 500);
  }
});
var learning_default = app4;

// src/api/stats.ts
var app5 = new Hono2();
app5.get("/", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  try {
    const [
      total,
      byStatus,
      byRating,
      byMonth,
      topCreators,
      recentConsumed,
      activeItems,
      bundles,
      allEntries,
      htmlVault
    ] = await Promise.all([
      DB.prepare("SELECT COUNT(*) as c FROM recommendations").first(),
      DB.prepare("SELECT status, COUNT(*) as c FROM recommendations GROUP BY status").all(),
      DB.prepare("SELECT user_rating, COUNT(*) as c FROM recommendations WHERE status='consumed' AND user_rating != 'unset' AND user_rating != '' GROUP BY user_rating ORDER BY c DESC").all(),
      DB.prepare("SELECT substr(consumed_date,1,7) as m, COUNT(*) as c FROM recommendations WHERE status='consumed' AND consumed_date != 'unset' GROUP BY m ORDER BY m ASC").all(),
      DB.prepare("SELECT creator, COUNT(*) as c FROM recommendations WHERE creator IS NOT NULL AND creator != '' GROUP BY creator ORDER BY c DESC LIMIT 15").all(),
      DB.prepare("SELECT video_title, creator, user_rating, user_review, consumed_date FROM recommendations WHERE status='consumed' ORDER BY consumed_date DESC LIMIT 25").all(),
      DB.prepare("SELECT video_title, creator, why_this, created_at FROM recommendations WHERE status='active' ORDER BY created_at DESC LIMIT 25").all(),
      DB.prepare("SELECT synergy_bundle_id, COUNT(*) as c FROM recommendations WHERE synergy_bundle_id != 'unset' GROUP BY synergy_bundle_id ORDER BY c DESC").all(),
      DB.prepare("SELECT video_title, creator, status, user_rating, user_review, why_this, synergy_bundle_id, created_at FROM recommendations ORDER BY created_at ASC").all(),
      DB.prepare("SELECT id, filename, created_at, length(content) as size FROM html_files ORDER BY created_at DESC").all()
    ]);
    const s = {};
    for (const r of byStatus?.results || []) s[r.status] = r.c;
    return c.json({
      total: total?.c || 0,
      byStatus: s,
      ratingDistribution: byRating?.results || [],
      consumptionByMonth: byMonth?.results || [],
      topCreators: topCreators?.results || [],
      recentConsumed: recentConsumed?.results || [],
      activeItems: activeItems?.results || [],
      bundles: bundles?.results || [],
      allEntries: allEntries?.results || [],
      htmlVault: htmlVault?.results || []
    });
  } catch (err) {
    return c.json(safeError("Stats failed")(err), 500);
  }
});
var stats_default = app5;

// src/api/search.ts
var app6 = new Hono2();
app6.get("/", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  const q = (c.req.query("q") || "").trim();
  if (!q || q.length < 2) return c.json({ groups: { recs: [], nodes: [], vault: [], patterns: [] }, q });
  const like = `%${q}%`;
  try {
    const [recs, nodes, vault, patterns] = await Promise.all([
      DB.prepare(
        `SELECT id, video_title as title, creator, content_type, status, user_rating
         FROM recommendations
         WHERE video_title LIKE ? OR creator LIKE ? OR why_this LIKE ?
         ORDER BY created_at DESC LIMIT 8`
      ).bind(like, like, like).all(),
      DB.prepare(
        `SELECT id, label, type, status, super_category
         FROM tree_nodes
         WHERE id LIKE ? OR label LIKE ?
         ORDER BY type, id LIMIT 8`
      ).bind(like, like).all(),
      DB.prepare(
        `SELECT id, filename, created_at
         FROM html_files
         WHERE filename LIKE ?
         ORDER BY created_at DESC LIMIT 8`
      ).bind(like).all(),
      DB.prepare(
        `SELECT id, description, strength
         FROM patterns
         WHERE id LIKE ? OR description LIKE ?
         ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END
         LIMIT 8`
      ).bind(like, like).all()
    ]);
    return c.json({
      q,
      groups: {
        recs: recs.results || [],
        nodes: nodes.results || [],
        vault: vault.results || [],
        patterns: patterns.results || []
      }
    });
  } catch (err) {
    return c.json(safeError("Search failed")(err), 500);
  }
});
var search_default = app6;

// src/shell.ts
var htmlShell = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Taste Map</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='3' fill='%233dd6c6'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" crossorigin>
<style>/* Prevent FOUT */ html{font-family:var(--font-ui)}</style>
<link rel="stylesheet" href="/static/app.css">
</head>
<body data-theme="dark">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand" title="Taste Map">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-btn" data-ws="curate" aria-label="Curate">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
        <span class="nav-label">Curate</span>
        <span class="nav-badge" id="nav-badge-curate" hidden>0</span>
      </button>
      <button class="nav-btn" data-ws="map" aria-label="Map">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><path d="m13.5 10.5 4-4M10.5 10.5l-4-4M13.5 13.5l4 4M10.5 13.5l-4 4"/></svg>
        <span class="nav-label">Map</span>
      </button>
      <button class="nav-btn" data-ws="log" aria-label="Log">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
        <span class="nav-label">Log</span>
      </button>
    </nav>
    <div class="sidebar-foot">
      <button class="nav-btn nav-icon-only" id="theme-btn" aria-label="Toggle theme">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      </button>
    </div>
  </aside>

  <main class="workspace" id="workspace">
    <header class="ws-head">
      <div class="ws-title">
        <h1 id="ws-name">Curate</h1>
        <p id="ws-sub" class="ws-sub">Your queue of things to consume</p>
      </div>
      <div class="ws-actions" id="ws-actions"></div>
    </header>

    <div class="ws-subnav" id="ws-subnav"></div>
    <div class="filters-bar" id="filters-bar" hidden></div>
    <div class="ws-body" id="ws-body">
      <div class="loading-skeleton">
        <div class="skel skel-row"></div>
        <div class="skel skel-row"></div>
        <div class="skel skel-row"></div>
        <div class="skel skel-row skel-short"></div>
      </div>
    </div>
  </main>

  <div class="sheet-backdrop" id="sheet-backdrop"></div>
  <aside class="sheet" id="sheet" role="dialog" aria-modal="true"></aside>

  <div class="modal-backdrop" id="modal-backdrop">
    <div class="modal" id="modal" role="dialog" aria-modal="true"></div>
  </div>

  <div class="palette-backdrop" id="palette-backdrop">
    <div class="palette" id="palette" role="dialog" aria-modal="true">
      <div class="palette-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:16px;height:16px;flex-shrink:0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input class="palette-input" id="palette-input" type="text" placeholder="Search recs, nodes, vault, patterns\u2026" autocomplete="off" spellcheck="false">
        <span class="palette-hint">ESC</span>
      </div>
      <div class="palette-body" id="palette-body">
        <div class="palette-empty">Start typing to search across everything</div>
      </div>
    </div>
  </div>

  <div class="batch-bar" id="batch-bar">
    <span class="batch-count" id="batch-count">0 selected</span>
    <div class="batch-actions">
      <button class="btn btn-sm" id="batch-consumed">Consume</button>
      <button class="btn btn-sm" id="batch-reject">Reject</button>
      <button class="btn btn-sm btn-ghost" id="batch-clear">Clear</button>
    </div>
  </div>

  <div class="toast-stack" id="toast-stack"></div>

  <button class="fab" id="fab-new" aria-label="New entry" title="New entry (n)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
  </button>

  <script src="/static/app.js"><\/script>
</body>
</html>`;

// src/assets/css.ts
var cssBundle = `/* ===== Tokens ===== */
:root {
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Dark (default) */
  --bg: oklch(0.14 0.01 250);
  --surface: oklch(0.17 0.012 250);
  --elevated: oklch(0.20 0.014 250);
  --overlay: oklch(0.23 0.016 250);
  --border: oklch(0.26 0.012 250);
  --border-strong: oklch(0.34 0.014 250);

  --ink: oklch(0.96 0.005 250);
  --ink-2: oklch(0.72 0.012 250);
  --ink-3: oklch(0.55 0.012 250);

  --accent: oklch(0.72 0.14 195);
  --accent-ink: oklch(0.20 0.05 195);
  --accent-tint: color-mix(in oklch, var(--accent) 12%, transparent);

  --active: oklch(0.78 0.15 85);
  --consumed: oklch(0.72 0.14 160);
  --rejected: oklch(0.65 0.19 25);

  --r-ctl: 6px;
  --r-card: 10px;
  --r-sheet: 12px;

  --ease: cubic-bezier(0.25, 1, 0.5, 1);
  --dur: 200ms;

  --sidebar-w: 64px;
  --sheet-w: 460px;
}

[data-theme="light"] {
  --bg: oklch(0.985 0 0);
  --surface: oklch(1 0 0);
  --elevated: oklch(0.99 0 0);
  --overlay: oklch(0.97 0 0);
  --border: oklch(0.90 0 0);
  --border-strong: oklch(0.82 0 0);

  --ink: oklch(0.18 0.01 250);
  --ink-2: oklch(0.42 0.012 250);
  --ink-3: oklch(0.55 0.012 250);

  --accent: oklch(0.55 0.13 195);
  --accent-ink: oklch(0.99 0 0);
}

/* ===== Micro-interactions ===== */
@keyframes cardPress {
  0% { transform: scale(1); }
  50% { transform: scale(0.985); }
  100% { transform: scale(1); }
}
.queue-card, .vault-row, .branch-card, .archive-item {
  transition: border-color var(--dur) var(--ease), transform 120ms var(--ease), box-shadow 120ms var(--ease);
}
.queue-card:active, .vault-row:active, .branch-card:active {
  transform: scale(0.985);
}
.btn, .chip-toggle, .canvas-btn, .nav-btn {
  transition: all var(--dur) var(--ease), transform 100ms var(--ease);
}
.btn:active, .chip-toggle:active, .canvas-btn:active {
  transform: scale(0.96);
}

/* Sheet spring curve */
.sheet {
  transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* Toast slide-in */
.toast {
  animation: toastSlide 250ms cubic-bezier(0.32, 0.72, 0, 1);
}
@keyframes toastSlide {
  from { opacity: 0; transform: translateX(24px); }
  to { opacity: 1; transform: none; }
}

/* Button spinner */
.btn.loading {
  position: relative;
  color: transparent !important;
  pointer-events: none;
}
.btn.loading::after {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  top: 50%; left: 50%;
  margin: -7px 0 0 -7px;
  border: 2px solid var(--ink-3);
  border-top-color: var(--ink);
  border-radius: 50%;
  animation: spin 600ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Empty state illustration */
.empty-ill {
  width: 64px; height: 64px;
  margin: 0 auto 16px;
  opacity: 0.35;
  color: var(--ink-3);
}

/* Canvas path highlight */
.canvas-node.path-dim {
  opacity: 0.25;
  transition: opacity var(--dur) var(--ease);
}
.canvas-edge.path-dim {
  stroke: var(--border);
  opacity: 0.3;
}

/* Undo toast */
.toast-undo {
  display: flex; align-items: center; gap: 10px;
}
.toast-undo button {
  background: var(--accent);
  color: var(--accent-ink);
  border: 0;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* Batch progress */
.batch-progress {
  position: absolute;
  bottom: 0; left: 0;
  height: 2px;
  background: var(--accent);
  transition: width 200ms var(--ease);
}

/* ===== Reset ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.55;
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow: hidden;
}
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
input, select, textarea { font: inherit; color: inherit; }
a { color: var(--accent); text-decoration: none; }
h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; text-wrap: balance; }
h2 { font-size: 16px; font-weight: 600; }
h3 { font-size: 13px; font-weight: 600; }
::selection { background: var(--accent-tint); }

/* ===== Layout ===== */
body { display: flex; }

.sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
  gap: 8px;
  z-index: 10;
}
.sidebar-brand {
  width: 40px; height: 40px;
  display: grid; place-items: center;
  color: var(--accent);
  margin-bottom: 8px;
}
.sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.nav-btn {
  width: 44px; height: 44px;
  display: grid; place-items: center;
  border-radius: var(--r-ctl);
  color: var(--ink-2);
  position: relative;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.nav-btn svg { width: 20px; height: 20px; }
.nav-btn:hover { background: var(--elevated); color: var(--ink); }
.nav-btn.active { background: var(--accent-tint); color: var(--accent); }
.nav-btn.active::before {
  content: ''; position: absolute; left: -10px; top: 50%; translate: 0 -50%;
  width: 3px; height: 22px; border-radius: 2px; background: var(--accent);
}
.nav-label { display: none; }
.sidebar-foot { margin-top: auto; }

.workspace {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
}
.ws-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 16px; padding: 20px 28px 12px;
  border-bottom: 1px solid var(--border);
}
.ws-sub { color: var(--ink-2); font-size: 13px; margin-top: 2px; }
.ws-actions { display: flex; gap: 8px; align-items: center; }

.ws-subnav {
  display: flex; gap: 4px; padding: 8px 28px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.seg {
  display: inline-flex; gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px; padding: 3px;
}
.seg-btn {
  padding: 5px 12px; font-size: 13px; font-weight: 500;
  border-radius: 6px; color: var(--ink-2);
  transition: all var(--dur) var(--ease);
  display: inline-flex; align-items: center; gap: 6px;
}
.seg-btn:hover { color: var(--ink); }
.seg-btn.active { background: var(--elevated); color: var(--ink); }
.seg-count {
  font-size: 11px; font-family: var(--font-mono);
  color: var(--ink-3);
  background: var(--bg);
  padding: 1px 6px; border-radius: 8px;
}
.seg-btn.active .seg-count { color: var(--accent); }

.ws-body {
  flex: 1; overflow-y: auto;
  padding: 20px 28px 80px;
}

/* ===== Buttons ===== */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 12px;
  font-size: 13px; font-weight: 500;
  border-radius: var(--r-ctl);
  color: var(--ink);
  border: 1px solid var(--border);
  background: var(--surface);
  transition: all var(--dur) var(--ease);
}
.btn:hover { background: var(--elevated); border-color: var(--border-strong); }
.btn svg { width: 14px; height: 14px; }
.btn-primary { background: var(--accent); border-color: transparent; color: var(--accent-ink); }
.btn-primary:hover { background: oklch(from var(--accent) calc(l + 0.05) c h); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--ink-2); }
.btn-ghost:hover { background: var(--elevated); color: var(--ink); }
.btn-danger { color: var(--rejected); }
.btn-danger:hover { background: color-mix(in oklch, var(--rejected) 10%, transparent); border-color: var(--rejected); }
.btn-icon { width: 32px; padding: 0; justify-content: center; }
.btn-sm { height: 26px; padding: 0 8px; font-size: 12px; }

/* ===== Status dot ===== */
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-active { background: var(--active); box-shadow: 0 0 0 3px color-mix(in oklch, var(--active) 20%, transparent); }
.dot-consumed { background: var(--consumed); }
.dot-rejected { background: var(--rejected); }

/* ===== Cards ===== */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 14px 16px;
  transition: border-color var(--dur) var(--ease);
}
.card:hover { border-color: var(--border-strong); }

/* ===== Queue (Curate) ===== */
.queue { display: flex; flex-direction: column; gap: 8px; max-width: 880px; }
.queue-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  transition: border-color var(--dur) var(--ease);
  animation: rise var(--dur) var(--ease) backwards;
}
.queue-card:hover { border-color: var(--border-strong); }
.queue-card .q-dot { align-self: start; margin-top: 6px; }
.q-main { min-width: 0; }
.q-title {
  font-size: 14px; font-weight: 500;
  color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.q-meta {
  display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px;
  font-size: 12px; color: var(--ink-2);
}
.q-meta .mono { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
.q-why {
  margin-top: 6px;
  font-size: 13px; color: var(--ink-2); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.q-actions { display: flex; gap: 6px; }

@keyframes rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

/* ===== Chips ===== */
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 500;
  padding: 2px 8px; border-radius: 999px;
  background: var(--elevated);
  color: var(--ink-2);
  border: 1px solid var(--border);
}
.chip-accent { background: var(--accent-tint); color: var(--accent); border-color: transparent; }
.chip-active { color: var(--active); }
.chip-consumed { color: var(--consumed); }
.chip-rejected { color: var(--rejected); }

/* ===== Stat blocks ===== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px; margin-bottom: 24px;
}
.stat-block {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 14px 16px;
}
.stat-block .s-label { font-size: 12px; color: var(--ink-2); }
.stat-block .s-value { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; margin-top: 4px; font-family: var(--font-mono); }
.stat-block .s-sub { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
.s-value.c-accent { color: var(--accent); }
.s-value.c-active { color: var(--active); }
.s-value.c-consumed { color: var(--consumed); }
.s-value.c-rejected { color: var(--rejected); }

/* ===== Section titles ===== */
.sec-title {
  font-size: 13px; font-weight: 600; color: var(--ink);
  margin: 24px 0 10px;
  display: flex; align-items: center; gap: 8px;
}
.sec-title:first-child { margin-top: 0; }
.sec-title .count { font-family: var(--font-mono); font-weight: 400; font-size: 11px; color: var(--ink-3); }

/* ===== Bar rows ===== */
.bar-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 3fr) auto;
  gap: 12px; align-items: center;
  padding: 5px 0;
}
.bar-row .b-label { font-size: 13px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-row .b-track { height: 6px; background: var(--elevated); border-radius: 3px; overflow: hidden; }
.bar-row .b-fill { height: 100%; border-radius: 3px; background: var(--accent); transition: width 600ms var(--ease); }
.bar-row .b-fill.c-active { background: var(--active); }
.bar-row .b-fill.c-consumed { background: var(--consumed); }
.bar-row .b-fill.c-rejected { background: var(--rejected); }
.bar-row .b-count { font-family: var(--font-mono); font-size: 12px; color: var(--ink); min-width: 32px; text-align: right; }

/* ===== Archive (consumed) ===== */
.archive { max-width: 880px; }
.archive-day { margin-bottom: 20px; }
.archive-date {
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
  margin-bottom: 6px;
}
.archive-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px; align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.archive-item:last-child { border-bottom: 0; }
.a-title { font-size: 14px; color: var(--ink); }
.a-meta { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
.a-review {
  margin-top: 6px; font-size: 13px; color: var(--ink-2);
  font-style: italic;
  padding-left: 12px; border-left: 2px solid var(--border-strong);
  max-width: 64ch;
}
.rating-tag {
  font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px;
  text-transform: capitalize;
}
.rating-love { background: color-mix(in oklch, var(--active) 18%, transparent); color: var(--active); }
.rating-like { background: color-mix(in oklch, var(--consumed) 15%, transparent); color: var(--consumed); }
.rating-meh { background: var(--elevated); color: var(--ink-2); }
.rating-dislike { background: color-mix(in oklch, var(--rejected) 15%, transparent); color: var(--rejected); }

/* ===== Sheet (slide-over) ===== */
.sheet-backdrop {
  position: fixed; inset: 0;
  background: oklch(0.05 0.01 250 / 0.55);
  opacity: 0; pointer-events: none;
  transition: opacity var(--dur) var(--ease);
  z-index: 40;
}
.sheet-backdrop.open { opacity: 1; pointer-events: auto; }
.sheet {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(var(--sheet-w), 100vw);
  background: var(--surface);
  border-left: 1px solid var(--border);
  transform: translateX(100%);
  transition: transform 250ms var(--ease);
  z-index: 41;
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.sheet.open { transform: none; }
.sheet-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--surface); z-index: 1;
}
.sheet-body { padding: 20px; flex: 1; }
.sheet-foot {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  display: flex; justify-content: flex-end; gap: 8px;
  position: sticky; bottom: 0; background: var(--surface);
}

/* ===== Forms ===== */
.field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
.field label { font-size: 12px; font-weight: 500; color: var(--ink-2); }
.input, .textarea, .select {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-ctl);
  padding: 8px 10px;
  font-size: 13px;
  color: var(--ink);
  outline: none;
  transition: border-color var(--dur) var(--ease);
  width: 100%;
}
.input:focus, .textarea:focus, .select:focus { border-color: var(--accent); }
.textarea { min-height: 90px; resize: vertical; font-family: inherit; }

/* Rating picker */
.rating-picker { display: flex; gap: 6px; }
.rating-opt {
  flex: 1; padding: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-ctl);
  font-size: 13px; font-weight: 500;
  color: var(--ink-2);
  transition: all var(--dur) var(--ease);
}
.rating-opt:hover { border-color: var(--border-strong); color: var(--ink); }
.rating-opt.selected[data-r="love"] { background: color-mix(in oklch, var(--active) 18%, transparent); border-color: var(--active); color: var(--active); }
.rating-opt.selected[data-r="like"] { background: color-mix(in oklch, var(--consumed) 15%, transparent); border-color: var(--consumed); color: var(--consumed); }
.rating-opt.selected[data-r="meh"] { background: var(--elevated); border-color: var(--ink-3); color: var(--ink); }
.rating-opt.selected[data-r="dislike"] { background: color-mix(in oklch, var(--rejected) 15%, transparent); border-color: var(--rejected); color: var(--rejected); }

/* ===== Modal ===== */
.modal-backdrop {
  position: fixed; inset: 0;
  background: oklch(0.05 0.01 250 / 0.55);
  display: grid; place-items: center;
  opacity: 0; pointer-events: none;
  transition: opacity var(--dur) var(--ease);
  z-index: 50;
}
.modal-backdrop.open { opacity: 1; pointer-events: auto; }
.modal {
  width: min(480px, calc(100vw - 32px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-sheet);
  padding: 20px;
  transform: scale(0.97);
  transition: transform var(--dur) var(--ease);
  max-height: 90vh; overflow-y: auto;
}
.modal-backdrop.open .modal { transform: none; }
.modal-wide { width: min(880px, calc(100vw - 32px)); }

/* ===== Toast ===== */
.toast-stack {
  position: fixed; bottom: 20px; right: 20px;
  display: flex; flex-direction: column; gap: 8px;
  z-index: 60;
}
.toast {
  background: var(--elevated);
  border: 1px solid var(--border-strong);
  color: var(--ink);
  padding: 10px 14px;
  border-radius: var(--r-ctl);
  font-size: 13px;
  animation: toastIn 200ms var(--ease);
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.3);
}
.toast.t-err { border-color: var(--rejected); color: var(--rejected); }
@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } }

/* ===== Map workspace ===== */
.map-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.map-toolbar .input { max-width: 260px; }

.canvas-stage {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  height: calc(100vh - 260px);
  min-height: 420px;
  overflow: hidden;
  cursor: grab;
}
.canvas-stage:active { cursor: grabbing; }
.canvas-inner { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.canvas-edges { position: absolute; top: 0; left: 0; pointer-events: none; }
.canvas-edge { stroke: var(--border-strong); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.canvas-node {
  position: absolute;
  translate: -50% -50%;
  padding: 5px 10px;
  background: var(--elevated);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 11px;
  color: var(--ink);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.canvas-node:hover { border-color: var(--accent); background: var(--accent-tint); }
.canvas-node.cn-category { font-weight: 600; padding: 7px 14px; font-size: 12px; }
.canvas-node.s-love { border-color: var(--active); color: var(--active); }
.canvas-node.s-locked { border-color: var(--rejected); color: var(--rejected); }
.canvas-node.s-fresh { border-color: var(--consumed); color: var(--consumed); }
.canvas-ctrls {
  position: absolute; bottom: 12px; right: 12px;
  display: flex; gap: 4px; z-index: 5;
}
.canvas-btn {
  width: 30px; height: 30px;
  background: var(--elevated);
  border: 1px solid var(--border);
  border-radius: var(--r-ctl);
  color: var(--ink);
  display: grid; place-items: center;
  font-size: 14px;
}
.canvas-btn:hover { border-color: var(--accent); color: var(--accent); }

/* Branch list */
.branch-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.branch-card {
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease);
}
.branch-card:hover { border-color: var(--accent); }
.branch-card .bc-id { font-family: var(--font-mono); font-size: 11px; color: var(--accent); }
.branch-card .bc-label { font-size: 13px; font-weight: 500; margin-top: 2px; }
.branch-card .bc-meta { font-size: 11px; color: var(--ink-3); margin-top: 4px; font-family: var(--font-mono); }

/* ===== Log workspace ===== */
.heatmap-wrap { overflow-x: auto; padding: 8px 0 16px; }
.heatmap { display: flex; gap: 3px; }
.heatmap-col { display: flex; flex-direction: column; gap: 3px; }
.heatmap-cell {
  width: 11px; height: 11px; border-radius: 2px;
  background: var(--elevated);
}
.heatmap-cell.l1 { background: color-mix(in oklch, var(--consumed) 30%, var(--elevated)); }
.heatmap-cell.l2 { background: color-mix(in oklch, var(--consumed) 55%, var(--elevated)); }
.heatmap-cell.l3 { background: color-mix(in oklch, var(--consumed) 80%, var(--elevated)); }
.heatmap-cell.l4 { background: var(--consumed); }
.heatmap-cell[data-count]:not([data-count="0"]) { cursor: pointer; }

.vault-list { display: flex; flex-direction: column; gap: 8px; max-width: 880px; }
.vault-row {
  display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  transition: border-color var(--dur) var(--ease);
}
.vault-row:hover { border-color: var(--border-strong); }
.vault-name { font-size: 14px; font-weight: 500; }
.vault-meta { font-size: 12px; color: var(--ink-3); margin-top: 2px; font-family: var(--font-mono); }
.vault-actions { display: flex; gap: 6px; }

/* ===== Empty states ===== */
.empty {
  padding: 64px 24px;
  text-align: center;
  color: var(--ink-3);
  font-size: 13px;
  max-width: 380px;
  margin: 40px auto;
}
.empty .e-title { font-size: 14px; font-weight: 600; color: var(--ink-2); margin-bottom: 4px; }
.empty .btn { margin-top: 14px; }

/* ===== Skeleton ===== */
.loading-skeleton { max-width: 880px; }
.skel {
  background: linear-gradient(90deg, var(--surface) 25%, var(--elevated) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: var(--r-card);
}
.skel-row { height: 64px; margin-bottom: 8px; }
.skel-short { width: 60%; }
@keyframes shimmer { to { background-position: -200% 0; } }

/* ===== Profile ===== */
.profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; max-width: 1080px; }
.pri-list { list-style: none; }
.pri-list li {
  display: grid; grid-template-columns: 28px 92px 1fr; gap: 10px; align-items: center;
  padding: 7px 10px;
  background: var(--bg);
  border-radius: var(--r-ctl);
  margin-bottom: 4px;
  font-size: 13px;
}
.pri-rank { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
.pri-id { font-family: var(--font-mono); font-size: 12px; color: var(--accent); }

.pattern-row {
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--r-ctl);
  margin-bottom: 6px;
}
.pattern-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.strength-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.strength-locked { background: var(--rejected); color: var(--bg); }
.strength-confirmed { background: var(--accent); color: var(--accent-ink); }
.strength-weak { background: var(--elevated); color: var(--ink-2); }
.pattern-desc { font-size: 13px; line-height: 1.5; }
.pattern-date { font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); margin-top: 4px; }

.mono { font-family: var(--font-mono); }
.muted { color: var(--ink-2); }
.dim { color: var(--ink-3); }

/* ===== Palette (Cmd+K) ===== */
.palette-backdrop {
  position: fixed; inset: 0;
  background: oklch(0.05 0.01 250 / 0.45);
  opacity: 0; pointer-events: none;
  transition: opacity 150ms var(--ease);
  z-index: 70;
  display: grid; place-items: start center;
  padding-top: 15vh;
}
.palette-backdrop.open { opacity: 1; pointer-events: auto; }
.palette {
  width: min(640px, calc(100vw - 32px));
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sheet);
  box-shadow: 0 8px 40px oklch(0 0 0 / 0.4);
  overflow: hidden;
  transform: scale(0.97) translateY(-10px);
  transition: transform 200ms var(--ease);
}
.palette-backdrop.open .palette { transform: none; }
.palette-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--elevated);
  color: var(--ink-2);
}
.palette-input {
  flex: 1; border: 0; background: transparent;
  font-size: 14px; color: var(--ink); outline: none;
}
.palette-input::placeholder { color: var(--ink-3); }
.palette-hint {
  font-size: 11px; font-family: var(--font-mono);
  color: var(--ink-3); padding: 2px 6px;
  background: var(--bg); border-radius: 4px;
}
.palette-body {
  max-height: 400px; overflow-y: auto;
  padding: 8px 0;
}
.palette-group {}
.palette-group-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--ink-3);
  padding: 6px 16px 4px;
}
.palette-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; cursor: pointer;
  transition: background var(--dur) var(--ease);
  border-left: 3px solid transparent;
}
.palette-item:hover, .palette-item.highlighted { background: var(--elevated); border-left-color: var(--accent); }
.palette-item .pi-icon { width: 16px; height: 16px; flex-shrink: 0; color: var(--ink-3); }
.palette-item .pi-title { font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.palette-item .pi-meta { font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); }
.palette-empty {
  padding: 32px 16px; text-align: center;
  color: var(--ink-3); font-size: 13px;
}

/* ===== Batch actions bar ===== */
.batch-bar {
  position: fixed; bottom: -60px; left: 50%; translate: -50% 0;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 18px;
  background: var(--elevated);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 4px 24px oklch(0 0 0 / 0.35);
  z-index: 35;
  transition: bottom 250ms var(--ease);
}
.batch-bar.open { bottom: 24px; }
.batch-count { font-size: 13px; font-weight: 500; color: var(--ink); font-family: var(--font-mono); }
.batch-actions { display: flex; gap: 6px; }

/* ===== Inline confirm ===== */
.confirm-btn {
  position: relative;
}
.confirm-btn.confirming { color: var(--rejected); border-color: var(--rejected); background: color-mix(in oklch, var(--rejected) 10%, transparent); }
.confirm-btn .confirm-timer {
  position: absolute; bottom: -2px; left: 4px; right: 4px;
  height: 2px; background: var(--rejected); border-radius: 1px;
  animation: confirmShrink 3s linear forwards;
}
@keyframes confirmShrink { from { width: 100%; } to { width: 0%; } }

/* ===== Stale indicators ===== */
.dot-stale { background: oklch(0.7 0.12 60); box-shadow: 0 0 0 3px oklch(0.7 0.12 60 / 0.2); }
.card-aging { border-left: 3px solid oklch(0.7 0.12 60); }
.card-stale { border-left: 3px solid var(--rejected); }
.aging-chip { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: oklch(0.7 0.12 60 / 0.15); color: oklch(0.7 0.12 60); }
.stale-chip { background: color-mix(in oklch, var(--rejected) 12%, transparent); color: var(--rejected); }

/* ===== Pattern strength controls ===== */
.pattern-row { position: relative; }
.pt-btn {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  background: var(--elevated); border: 1px solid var(--border);
  color: var(--ink-2); cursor: pointer;
  transition: all var(--dur) var(--ease);
  font-family: var(--font-mono);
}
.pt-btn:hover { border-color: var(--accent); color: var(--ink); }
.pt-btn.pt-active { background: var(--accent-tint); border-color: var(--accent); color: var(--accent); }

/* ===== Contradictions ===== */
.contra-card {
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  margin-bottom: 8px;
}
.contra-tension { font-size: 13px; line-height: 1.5; margin: 6px 0; padding: 8px 10px; background: var(--bg); border-radius: var(--r-ctl); border-left: 3px solid var(--accent); }
.contra-sources { display: flex; gap: 8px; flex-wrap: wrap; }
.contra-source { font-size: 12px; padding: 3px 8px; background: var(--elevated); border-radius: 4px; font-family: var(--font-mono); }

/* ===== Rating distribution ===== */
.dist-row {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 4px;
}
.dist-label { width: 60px; font-size: 12px; font-weight: 500; text-transform: capitalize; }
.dist-track { flex: 1; height: 20px; background: var(--elevated); border-radius: 4px; overflow: hidden; display: flex; }
.dist-fill { height: 100%; transition: width 600ms var(--ease); border-radius: 4px; }
.dist-count { width: 32px; text-align: right; font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); }

/* ===== Canvas tooltip ===== */
.canvas-tooltip {
  position: absolute; z-index: 20;
  pointer-events: none;
  background: var(--elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-ctl);
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
  box-shadow: 0 4px 12px oklch(0 0 0 / 0.3);
  transform: translate(10px, -50%);
}

/* ===== Breadcrumbs ===== */
.crumbs {
  display: flex; align-items: center; gap: 4px;
  flex-wrap: wrap; margin-bottom: 12px;
  font-size: 12px;
}
.crumb {
  color: var(--ink-2); padding: 2px 8px;
  background: var(--bg); border-radius: 4px;
  cursor: pointer;
  transition: all var(--dur) var(--ease);
  font-family: var(--font-mono);
}
.crumb:hover { color: var(--accent); background: var(--accent-tint); }
.crumb-sep { color: var(--ink-3); font-size: 10px; }

/* ===== Branch chip link ===== */
.br-link {
  cursor: pointer; font-family: var(--font-mono); font-size: 11px;
  transition: all var(--dur) var(--ease);
}
.br-link:hover { color: var(--accent); text-decoration: underline; }

/* ===== Profile editing ===== */
.profile-edit-btn {
  font-size: 11px; padding: 2px 8px; margin-left: 8px;
  opacity: 0.4; transition: opacity var(--dur) var(--ease);
}
.card:hover .profile-edit-btn { opacity: 1; }
.profile-editor textarea { font-size: 12px; min-height: 60px; font-family: var(--font-mono); }
.profile-editor .editor-actions { display: flex; gap: 6px; margin-top: 6px; }
.pri-drag { cursor: grab; display: flex; align-items: center; gap: 6px; }
.pri-drag:active { cursor: grabbing; }

/* ===== Checkbox ===== */
.chk {
  width: 18px; height: 18px; border-radius: 4px;
  border: 2px solid var(--border-strong);
  background: transparent;
  cursor: pointer; flex-shrink: 0;
  display: grid; place-items: center;
  transition: all var(--dur) var(--ease);
  appearance: none;
}
.chk:checked { background: var(--accent); border-color: var(--accent); }
.chk:checked::after { content: ''; width: 6px; height: 10px; border: solid var(--accent-ink); border-width: 0 2px 2px 0; transform: rotate(45deg); margin-top: -2px; }
.chk:hover { border-color: var(--accent); }

/* ===== Responsive ===== */
@media (max-width: 1024px) {
  .q-actions { flex-direction: row; }
  .sheet { width: min(520px, 100vw); }
}

@media (max-width: 720px) {
  body { flex-direction: column; }
  .sidebar {
    width: 100%; height: 56px;
    flex-direction: row;
    order: 2;
    border-right: 0; border-top: 1px solid var(--border);
    padding: 0 8px;
    position: fixed; bottom: 0; left: 0; right: 0;
  }
  .sidebar-brand { display: none; }
  .sidebar-nav { flex-direction: row; flex: 1; justify-content: space-around; }
  .nav-btn { width: 56px; height: 44px; }
  .nav-btn.active::before { left: 50%; top: -5px; translate: -50% 0; width: 22px; height: 3px; }
  .sidebar-foot { margin-top: 0; }
  .workspace { height: calc(100vh - 56px); }
  .ws-head { padding: 16px 16px 10px; flex-direction: column; align-items: flex-start; }
  .ws-subnav { padding: 8px 16px; overflow-x: auto; }
  .ws-body { padding: 16px 16px 80px; }
  .sheet { width: 100vw; border-left: 0; border-top: 1px solid var(--border); top: auto; height: 88vh; border-radius: var(--r-sheet) var(--r-sheet) 0 0; transform: translateY(100%); }
  .sheet.open { transform: none; }
  .queue-card { grid-template-columns: auto 1fr; }
  .q-actions { grid-column: 1 / -1; justify-content: flex-end; }
}

/* ===== v2 features ===== */

/* Nav badge (resurfacing count) */
.nav-badge {
  position: absolute; top: 4px; right: 4px;
  min-width: 16px; height: 16px; padding: 0 4px;
  background: var(--rejected); color: var(--bg);
  border-radius: 8px; font-size: 10px; font-weight: 600;
  font-family: var(--font-mono);
  display: grid; place-items: center;
  line-height: 1;
}

/* Top-bar search trigger */
.topbar-search {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-ctl);
  color: var(--ink-3);
  font-size: 12px;
  transition: all var(--dur) var(--ease);
}
.topbar-search:hover { border-color: var(--border-strong); color: var(--ink-2); }
.topbar-search kbd {
  font-family: var(--font-mono); font-size: 10px;
  padding: 1px 5px; border-radius: 3px;
  background: var(--elevated); color: var(--ink-2);
  border: 1px solid var(--border);
}

/* Floating quick-capture */
.fab {
  position: fixed; right: 24px; bottom: 24px;
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--accent); color: var(--accent-ink);
  border: 0; cursor: pointer; z-index: 30;
  display: grid; place-items: center;
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.4);
  transition: transform var(--dur) var(--ease);
}
.fab:hover { transform: scale(1.05); }
.fab svg { width: 20px; height: 20px; }
@media (max-width: 720px) { .fab { right: 16px; bottom: 72px; } }

/* Filters bar */
.filters-bar {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 10px 28px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  align-items: center;
}
.chip-toggle {
  cursor: pointer; user-select: none;
  transition: all var(--dur) var(--ease);
}
.chip-toggle:hover { color: var(--ink); }
.chip-toggle.chip-on { background: var(--accent-tint); color: var(--accent); border-color: transparent; }
.filter-input {
  height: 26px; padding: 0 8px; font-size: 12px;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--r-ctl); color: var(--ink);
  max-width: 180px; outline: none;
}
.filter-input:focus { border-color: var(--accent); }

/* Bulk action bar */
.bulk-bar {
  position: sticky; bottom: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: var(--elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-card);
  margin-top: 16px;
  z-index: 5;
  animation: rise var(--dur) var(--ease);
}
.bulk-bar .bulk-count { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); }
.bulk-bar .bulk-spacer { flex: 1; }

/* Row checkboxes (always visible per DESIGN.md) */
.q-check {
  width: 16px; height: 16px;
  appearance: none; -webkit-appearance: none;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: var(--bg);
  cursor: pointer;
  position: relative;
  transition: all var(--dur) var(--ease);
  flex-shrink: 0;
}
.q-check:hover { border-color: var(--accent); }
.q-check:checked { background: var(--accent); border-color: var(--accent); }
.q-check:checked::after {
  content: ''; position: absolute; left: 4px; top: 1px;
  width: 5px; height: 9px;
  border: solid var(--accent-ink);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.q-check.indeterminate { background: var(--accent); border-color: var(--accent); }
.q-check.indeterminate::after {
  content: ''; position: absolute; left: 3px; top: 6px;
  width: 8px; height: 2px;
  background: var(--accent-ink);
}

/* Command palette */
.palette {
  width: min(640px, calc(100vw - 32px));
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sheet);
  overflow: hidden;
  max-height: 80vh;
  display: flex; flex-direction: column;
}
.palette-input {
  width: 100%;
  background: transparent; border: 0;
  padding: 16px 20px;
  font-size: 15px; color: var(--ink);
  outline: none;
  border-bottom: 1px solid var(--border);
}
.palette-list { overflow-y: auto; padding: 6px 0; flex: 1; }
.palette-section {
  padding: 8px 20px 4px;
  font-size: 11px; font-weight: 600;
  color: var(--ink-3); text-transform: uppercase;
  letter-spacing: 0.04em;
}
.palette-item {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  gap: 10px; align-items: center;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 13px;
  color: var(--ink);
}
.palette-item:hover, .palette-item.focused { background: var(--elevated); }
.palette-kind { font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); text-transform: uppercase; }
.palette-kind.k-rec { color: var(--accent); }
.palette-kind.k-node { color: var(--consumed); }
.palette-kind.k-vault { color: var(--active); }
.palette-kind.k-pattern { color: var(--rejected); }

/* Keymap overlay */
.kbd-table { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
.kbd-row { display: flex; align-items: center; gap: 10px; }
.kbd-row .kbd-keys { display: flex; gap: 4px; min-width: 110px; }
.kbd-row .kbd-desc { font-size: 13px; color: var(--ink-2); }
.kbd-keys kbd {
  font-family: var(--font-mono); font-size: 11px;
  padding: 2px 7px; border-radius: 3px;
  background: var(--bg); color: var(--ink);
  border: 1px solid var(--border);
}

/* Radar */
.radar-bar {
  display: grid;
  grid-template-columns: 140px 1fr 60px;
  gap: 12px; align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}
.radar-bar:last-child { border-bottom: 0; }
.radar-track {
  position: relative;
  height: 14px;
  background: var(--bg);
  border-radius: 3px;
  overflow: hidden;
}
.radar-track::before {
  content: ''; position: absolute; left: 50%; top: 0; bottom: 0;
  width: 1px; background: var(--border-strong);
}
.radar-fill-left, .radar-fill-right {
  position: absolute; top: 0; bottom: 0;
}
.radar-fill-left { right: 50%; background: color-mix(in oklch, var(--rejected) 60%, transparent); }
.radar-fill-right { left: 50%; background: color-mix(in oklch, var(--accent) 60%, transparent); }
.radar-delta { font-family: var(--font-mono); font-size: 12px; text-align: right; color: var(--ink-2); }
.radar-delta.pos { color: var(--accent); }
.radar-delta.neg { color: var(--rejected); }

/* Canvas 2.0 */
.canvas-node.dim { opacity: 0.3; }
.canvas-node.focused { border-color: var(--accent); background: var(--accent-tint); z-index: 2; }
.canvas-node.neglected { animation: pulse 2.2s var(--ease) infinite; }
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--active) 50%, transparent); }
  70% { box-shadow: 0 0 0 8px color-mix(in oklch, var(--active) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--active) 0%, transparent); }
}
.canvas-search {
  position: absolute; top: 12px; left: 12px;
  width: 220px; z-index: 5;
}
.canvas-search-results {
  position: absolute; top: 50px; left: 12px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-ctl);
  max-height: 200px; overflow-y: auto;
  z-index: 6;
  min-width: 220px;
  display: none;
}
.canvas-search-results.open { display: block; }
.canvas-search-results .palette-item { padding: 6px 10px; font-size: 12px; }

/* Tensions */
.tension-card {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  gap: 12px; align-items: start;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  margin-bottom: 8px;
}
.tension-card .t-source { font-size: 13px; font-weight: 500; }
.tension-card .t-meta { font-size: 11px; color: var(--ink-3); margin-top: 2px; font-family: var(--font-mono); }
.tension-vs { font-family: var(--font-mono); font-size: 11px; color: var(--rejected); align-self: center; }
.tension-topic { font-size: 12px; }
.tension-body { font-size: 12px; color: var(--ink-2); margin-top: 6px; line-height: 1.5; grid-column: 1 / -1; }

/* Digest (Log/Journal) */
.digest {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 18px 22px;
  margin-bottom: 24px;
  max-width: 880px;
}
.digest-date { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.digest-day { font-size: 12px; color: var(--ink-3); margin-bottom: 12px; font-family: var(--font-mono); }
.digest-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.digest-section-title { font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; font-weight: 600; }
.digest-item { font-size: 13px; padding: 4px 0; display: flex; gap: 8px; align-items: center; }
.digest-item a { color: var(--ink); }
.digest-item a:hover { color: var(--accent); }

/* Vault preview */
.vault-row { cursor: pointer; }
.vault-row.expanded { border-color: var(--accent); }
.vault-preview {
  padding: 0 0 12px;
}
.vault-preview-inner {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-ctl);
  overflow: hidden;
}
.vault-preview-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px;
  background: var(--elevated);
  font-size: 11px; color: var(--ink-3);
  font-family: var(--font-mono);
  border-bottom: 1px solid var(--border);
}
.vault-preview-bar a { font-family: var(--font-mono); }
.vault-preview iframe {
  width: 100%; height: 60vh;
  border: 0; background: white;
  display: block;
}

/* Pattern meter */
.pattern-row { display: block; }
.pattern-row .pattern-actions {
  display: flex; align-items: center; gap: 8px; margin-top: 8px;
}
.strength-meter { display: flex; gap: 2px; }
.strength-meter button {
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 3px 8px; border-radius: 3px;
  background: var(--bg); color: var(--ink-3);
  border: 1px solid var(--border);
  transition: all var(--dur) var(--ease);
}
.strength-meter button:hover { color: var(--ink); border-color: var(--border-strong); }
.strength-meter button.on[data-s="weak"] { background: var(--elevated); color: var(--ink-2); border-color: var(--ink-3); }
.strength-meter button.on[data-s="confirmed"] { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
.strength-meter button.on[data-s="locked"] { background: var(--rejected); color: var(--bg); border-color: transparent; }
.evidence-bar { width: 80px; height: 4px; background: var(--elevated); border-radius: 2px; overflow: hidden; }
.evidence-bar-fill { height: 100%; background: var(--accent); }

/* Branch health */
.bc-age { font-family: var(--font-mono); font-size: 11px; }
.bc-age.fresh { color: var(--consumed); }
.bc-age.warm { color: var(--active); }
.bc-age.stale { color: var(--rejected); }
.bc-mastery { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 11px; color: var(--ink-3); }
.bc-mastery .bar-mini { width: 60px; height: 3px; background: var(--bg); border-radius: 2px; overflow: hidden; }
.bc-mastery .bar-mini-fill { height: 100%; background: var(--accent); }
.bc-stale-pulse { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--rejected); animation: pulse 2s var(--ease) infinite; margin-left: 4px; }
.branch-sort { display: flex; gap: 4px; margin-bottom: 12px; }

/* Mega composer */
.mega-textarea {
  min-height: 140px;
  font-size: 14px; line-height: 1.6;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-ctl);
  padding: 12px 14px;
  color: var(--ink);
  outline: none;
  width: 100%; resize: vertical;
  font-family: inherit;
}
.mega-textarea:focus { border-color: var(--accent); }
.mega-section { margin-bottom: 24px; max-width: 720px; }
.mega-section h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.mega-section h3 .count { font-family: var(--font-mono); font-weight: 400; font-size: 11px; color: var(--ink-3); }
.pri-row {
  display: grid;
  grid-template-columns: 24px 100px 1fr auto;
  gap: 10px; align-items: center;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: var(--r-ctl);
  margin-bottom: 4px;
  font-size: 13px;
  cursor: grab;
  border: 1px solid transparent;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.pri-row:hover { border-color: var(--border); }
.pri-row.dragging { opacity: 0.4; }
.pri-row.drop-above { border-top: 2px solid var(--accent); }
.pri-row.drop-below { border-bottom: 2px solid var(--accent); }
.pri-rank { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
.pri-id { font-family: var(--font-mono); font-size: 12px; color: var(--accent); }
.pri-handle { color: var(--ink-3); font-size: 14px; }
.mega-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.mega-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; font-size: 12px;
  background: var(--accent-tint); color: var(--accent);
  border-radius: 999px;
}
.mega-chip .x { cursor: pointer; opacity: 0.6; }
.mega-chip .x:hover { opacity: 1; }

/* Blacklist warning */
.bl-warn {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: color-mix(in oklch, var(--rejected) 12%, transparent);
  border: 1px solid var(--rejected);
  border-radius: var(--r-ctl);
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--rejected);
}
.bl-warn .mono { color: var(--rejected); }
`;

// src/assets/js.ts
var jsBundle = `'use strict';
// ---------- utils ----------
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => { if (s == null) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; };
const api = async (url, opts) => {
  const r = await fetch(url, opts ? { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } } : undefined);
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ('HTTP ' + r.status)); }
  return r.json();
};
const toast = (msg, err) => {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' t-err' : '');
  t.textContent = msg;
  $('#toast-stack').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); }, 2600);
};

// Undo toast with action callback
const toastUndo = (msg, onUndo) => {
  const t = document.createElement('div');
  t.className = 'toast toast-undo';
  t.innerHTML = '<span>' + esc(msg) + '</span>';
  const btn = document.createElement('button');
  btn.textContent = 'Undo';
  btn.onclick = () => { t.remove(); onUndo(); };
  t.appendChild(btn);
  $('#toast-stack').appendChild(t);
  const timer = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); }, 4000);
  t.onclick = (e) => { if (e.target !== btn) { clearTimeout(timer); t.remove(); } };
};

// Set button loading state
const setLoading = (btn, loading) => {
  if (!btn) return;
  if (loading) {
    btn.classList.add('loading');
    btn.dataset.origText = btn.textContent;
  } else {
    btn.classList.remove('loading');
    if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
  }
};
const fmtDate = (d) => {
  if (!d || d === 'unset') return '';
  try { const dt = new Date(d); if (isNaN(dt)) return d; return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; }
};
const age = (d) => {
  if (!d || d === 'unset') return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d';
  if (days < 30) return days + 'd';
  return Math.floor(days / 30) + 'mo';
};

// ---------- state ----------
const state = {
  ws: 'curate', sub: { curate: 'queue', map: 'canvas', log: 'journal' },
  recs: [], recsTotal: 0,
  brain: { profile: null, tree: null, health: null },
  learning: [],
  vault: [],
  stats: null,
  search: '',
  loaded: { recs: false, brain: false, learning: false, vault: false, stats: false },
  selection: new Set(),
  filters: { content_type: new Set(), rating: new Set(), since: null, has_why: false, creator: '' },
  focusedRow: 0,
  paletteOpen: false,
  paletteHi: 0,
  keySeq: null,
  resurfaceCount: 0,
  branchSort: 'recency',
};

const WS = {
  curate: {
    name: 'Curate', sub: 'Your queue of things to consume',
    views: [['queue', 'Queue'], ['archive', 'Archive'], ['all', 'All'], ['resurfacing', 'Resurface']],
  },
  map: {
    name: 'Map', sub: 'What you know, mapped',
    views: [['canvas', 'Canvas'], ['branches', 'Branches'], ['radar', 'Radar'], ['profile', 'Profile'], ['resurfacing', 'Resurface'], ['tensions', 'Tensions'], ['mega', 'Mega']],
  },
  log: {
    name: 'Log', sub: 'What you did and produced',
    views: [['journal', 'Journal'], ['vault', 'Vault'], ['stats', 'Stats']],
  },
};

// ---------- data fetching ----------
async function loadRecs() {
  const j = await api('/recommendations/list?limit=200');
  state.recs = j.recommendations || [];
  state.recsTotal = j.total || state.recs.length;
  state.loaded.recs = true;
}
async function loadBrain() {
  try {
    const [p, t, h] = await Promise.all([
      api('/brain/profile'), api('/brain/tree'), api('/brain/health'),
    ]);
    state.brain = { profile: p, tree: t, health: h };
  } catch { }
  state.loaded.brain = true;
  refreshResurfaceBadge();
}
async function loadLearning() {
  try { const j = await api('/learning/heatmap'); state.learning = j.days || []; } catch { state.learning = []; }
  state.loaded.learning = true;
}
async function loadVault() {
  try { const j = await api('/html/list'); state.vault = j.files || []; } catch { state.vault = []; }
  state.loaded.vault = true;
}
async function loadStats() {
  try { state.stats = await api('/stats'); } catch { }
  state.loaded.stats = true;
}

async function refreshResurfaceBadge() {
  try {
    const j = await api('/brain/resurfacing');
    const due = (j.due || []).length;
    state.resurfaceCount = due;
    const badge = document.getElementById('nav-badge-curate');
    if (!badge) return;
    if (due > 0) { badge.hidden = false; badge.textContent = due > 99 ? '99+' : String(due); }
    else { badge.hidden = true; }
  } catch {}
}

// ---------- shell ----------
function setWorkspace(ws, sub) {
  state.ws = ws;
  if (sub) state.sub[ws] = sub;
  $$('.nav-btn[data-ws]').forEach(b => b.classList.toggle('active', b.dataset.ws === ws));
  $('#ws-name').textContent = WS[ws].name;
  $('#ws-sub').textContent = WS[ws].sub;
  renderSubnav();
  renderActions();
  renderBody();
  history.replaceState(null, '', '#/' + ws + '/' + state.sub[ws]);
}
function renderSubnav() {
  const nav = $('#ws-subnav');
  nav.innerHTML = '';
  const seg = document.createElement('div');
  seg.className = 'seg';
  WS[state.ws].views.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.className = 'seg-btn' + (state.sub[state.ws] === id ? ' active' : '');
    b.innerHTML = esc(label) + countBadge(id);
    b.onclick = () => setWorkspace(state.ws, id);
    seg.appendChild(b);
  });
  nav.appendChild(seg);
  if (state.ws === 'curate' || (state.ws === 'map' && state.sub.map !== 'profile')) {
    const inp = document.createElement('input');
    inp.className = 'input'; inp.placeholder = 'Filter\u2026';
    inp.style.cssText = 'max-width:220px;height:32px;margin-left:auto';
    inp.value = state.search;
    inp.oninput = () => { state.search = inp.value; renderBody(); };
    nav.appendChild(inp);
  }
}
function countBadge(view) {
  const r = state.recs;
  if (view === 'queue') return ' <span class="seg-count">' + r.filter(x => x.status === 'active').length + '</span>';
  if (view === 'archive') return ' <span class="seg-count">' + r.filter(x => x.status === 'consumed').length + '</span>';
  if (view === 'all') return ' <span class="seg-count">' + r.length + '</span>';
  if (view === 'vault') return ' <span class="seg-count">' + state.vault.length + '</span>';
  return '';
}
function renderActions() {
  const a = $('#ws-actions');
  a.innerHTML = '';
  // topbar search trigger (feature 1)
  const tb = document.createElement('button');
  tb.className = 'topbar-search';
  tb.id = 'tb-search';
  tb.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg> Search <kbd>\u2318K</kbd>';
  tb.onclick = openPalette;
  a.appendChild(tb);

  if (state.ws === 'curate') {
    const refresh = document.createElement('button');
    refresh.className = 'btn'; refresh.id = 'act-refresh';
    refresh.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>Refresh';
    refresh.onclick = () => { refresh(true); };
    const neu = document.createElement('button');
    neu.className = 'btn btn-primary'; neu.id = 'act-new';
    neu.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>New entry';
    neu.onclick = openPushSheet;
    a.append(refresh, neu);
  } else if (state.ws === 'log' && state.sub.log === 'vault') {
    const up = document.createElement('button');
    up.className = 'btn btn-primary'; up.id = 'act-upload';
    up.textContent = 'Upload file';
    up.onclick = openUploadSheet;
    a.appendChild(up);
  } else if (state.ws === 'log' && state.sub.log === 'journal') {
    const lg = document.createElement('button');
    lg.className = 'btn btn-primary'; lg.id = 'act-log';
    lg.textContent = 'Log today';
    lg.onclick = openLogSheet;
    a.appendChild(lg);
  }
}
function renderBody() {
  const body = $('#ws-body');
  body.innerHTML = '';
  // reset batch bar visibility per view
  updateBatchBar();
  const key = state.ws + '.' + state.sub[state.ws];
  const needsData = {
    'curate.queue': ['recs'], 'curate.archive': ['recs'], 'curate.all': ['recs'], 'curate.resurfacing': ['brain'],
    'map.canvas': ['brain'], 'map.branches': ['brain'], 'map.profile': ['brain'], 'map.resurfacing': ['brain'], 'map.radar': ['brain', 'recs'], 'map.tensions': ['brain'], 'map.mega': ['brain'],
    'log.journal': ['learning', 'recs', 'vault'], 'log.vault': ['vault'], 'log.stats': ['stats'],
  }[key] || [];
  const missing = needsData.filter(d => !state.loaded[d]);
  if (missing.length) {
    body.innerHTML = '<div class="loading-skeleton"><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>';
    return;
  }
  VIEWS[key](body);
  renderFiltersBar();
}

// ---------- sheet / modal ----------
function openSheet(title, bodyEl, footEl) {
  const sheet = $('#sheet');
  sheet.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'sheet-head';
  head.innerHTML = '<h2>' + esc(title) + '</h2>';
  const close = document.createElement('button');
  close.className = 'btn btn-ghost btn-icon';
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  close.onclick = closeSheet;
  head.appendChild(close);
  sheet.appendChild(head);
  const body = document.createElement('div');
  body.className = 'sheet-body';
  body.appendChild(bodyEl);
  sheet.appendChild(body);
  if (footEl) {
    const foot = document.createElement('div');
    foot.className = 'sheet-foot';
    foot.appendChild(footEl);
    sheet.appendChild(foot);
  }
  $('#sheet-backdrop').classList.add('open');
  sheet.classList.add('open');
}
function closeSheet() {
  $('#sheet-backdrop').classList.remove('open');
  $('#sheet').classList.remove('open');
}
$('#sheet-backdrop').onclick = closeSheet;

function openModal(contentEl, wide) {
  const m = $('#modal');
  m.className = 'modal' + (wide ? ' modal-wide' : '');
  m.innerHTML = '';
  m.appendChild(contentEl);
  $('#modal-backdrop').classList.add('open');
}
function closeModal() { $('#modal-backdrop').classList.remove('open'); }
$('#modal-backdrop').onclick = (e) => { if (e.target.id === 'modal-backdrop') closeModal(); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSheet(); closeModal(); closePalette(); }
});

// ---------- sheets ----------
function field(label, input) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  f.appendChild(l);
  f.appendChild(input);
  return f;
}
function input(attrs) {
  const i = document.createElement('input');
  i.className = 'input';
  Object.assign(i, attrs || {});
  return i;
}
function textarea(attrs) {
  const t = document.createElement('textarea');
  t.className = 'textarea';
  Object.assign(t, attrs || {});
  return t;
}

function openPushSheet() {
  const body = document.createElement('div');
  const title = input({ placeholder: 'Title of the content' });
  const creator = input({ placeholder: 'Author / channel' });
  const url = input({ placeholder: 'https://\u2026', type: 'url' });
  const type = document.createElement('select');
  type.className = 'select';
  ['video', 'book', 'article', 'podcast', 'course', 'paper', 'other'].forEach(t => {
    const o = document.createElement('option'); o.value = t; o.textContent = t[0].toUpperCase() + t.slice(1); type.appendChild(o);
  });
  const why = textarea({ placeholder: 'Why does this belong on the map?' });
  const dedup = input({ placeholder: 'stable-key (optional)' });
  const bundle = input({ placeholder: 'synergy bundle (optional)' });
  body.append(
    field('Title', title),
    field('Creator', creator),
    field('URL', url),
    field('Type', type),
    field('Why this?', why),
    field('Dedup key', dedup),
    field('Synergy bundle', bundle),
  );
  // feature 13: blacklist live check
  const warnSlot = document.createElement('div');
  body.insertBefore(warnSlot, body.firstChild);
  const checkBl = async () => {
    const v = (url.value + ' ' + creator.value).trim();
    warnSlot.innerHTML = '';
    if (v.length < 3) return;
    try {
      const j = await api('/recommendations/check-blacklist?q=' + encodeURIComponent(v));
      if (j.matches && j.matches.length) {
        const w = document.createElement('div');
        w.className = 'bl-warn';
        w.innerHTML = '<strong>Blacklist match:</strong> ' + j.matches.slice(0, 2).map(m => '<span class="mono">' + esc(m.name) + '</span>' + (m.work ? ' (' + esc(m.work) + ')' : '')).join(', ');
        warnSlot.appendChild(w);
      }
    } catch {}
  };
  url.addEventListener('blur', checkBl);
  creator.addEventListener('blur', checkBl);

  const foot = document.createElement('div');
  foot.style.cssText = 'display:flex;gap:8px';
  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.textContent = 'Push to queue';
  save.onclick = async () => {
    if (!title.value.trim() || !url.value.trim()) return toast('Title and URL are required', true);
    setLoading(save, true);
    try {
      await api('/recommendations/push', {
        method: 'POST',
        body: JSON.stringify({
          video_title: title.value.trim(), creator: creator.value.trim(),
          content_type: type.value, video_url: url.value.trim(),
          why_this: why.value.trim(),
          dedup_key: dedup.value.trim() || undefined,
          synergy_bundle_id: bundle.value.trim() || undefined,
          verified: new Date().toISOString().split('T')[0],
        }),
      });
      toast('Pushed to queue');
      closeSheet();
      await loadRecs(); renderSubnav(); renderBody();
    } catch (e) { toast('Push failed: ' + e.message, true); }
    finally { setLoading(save, false); }
  };
  foot.appendChild(save);
  openSheet('New entry', body, foot);
}

function openReviewSheet(item, targetStatus) {
  const body = document.createElement('div');
  const head = document.createElement('div');
  head.style.marginBottom = '16px';
  head.innerHTML = '<div style="font-size:15px;font-weight:600">' + esc(item.video_title) + '</div>' +
    '<div class="muted" style="font-size:12px;margin-top:2px">' + esc(item.creator || 'Unknown') + '</div>';
  body.appendChild(head);

  const picker = document.createElement('div');
  picker.className = 'rating-picker';
  let rating = (item.user_rating && item.user_rating !== 'unset') ? item.user_rating : '';
  ['love', 'like', 'meh', 'dislike'].forEach(r => {
    const b = document.createElement('button');
    b.className = 'rating-opt' + (rating === r ? ' selected' : '');
    b.dataset.r = r;
    b.textContent = r[0].toUpperCase() + r.slice(1);
    b.onclick = () => {
      rating = rating === r ? '' : r;
      $$('.rating-opt', picker).forEach(x => x.classList.toggle('selected', x.dataset.r === rating));
    };
    picker.appendChild(b);
  });
  body.appendChild(field('Rating', picker));

  const notes = textarea({ placeholder: 'Takeaways, reflections, quotes\u2026' });
  notes.value = item.user_review || '';
  body.appendChild(field('Review', notes));

  const foot = document.createElement('div');
  foot.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.textContent = targetStatus === 'consumed' ? 'Mark consumed' : targetStatus === 'rejected' ? 'Reject' : 'Save';
  save.onclick = async () => {
    setLoading(save, true);
    try {
      await api('/recommendations/action', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id, status: targetStatus,
          user_rating: rating || 'unset', user_review: notes.value.trim(),
          consumed_date: new Date().toISOString().split('T')[0],
        }),
      });
      const msg = targetStatus === 'consumed' ? 'Logged as consumed' : targetStatus === 'rejected' ? 'Rejected' : 'Saved';
      toast(msg);
      closeSheet();
      await loadRecs(); await loadBrain(); renderSubnav(); renderBody();
    } catch (e) { toast('Failed: ' + e.message, true); }
    finally { setLoading(save, false); }
  };
  foot.appendChild(save);
  openSheet(targetStatus === 'consumed' ? 'Consume & review' : targetStatus === 'rejected' ? 'Reject entry' : 'Edit entry', body, foot);
}

function openLogSheet() {
  const body = document.createElement('div');
  const topics = input({ placeholder: 'e.g. behavioral econ, tazkiyah, persuasion' });
  body.appendChild(field('What did you learn today?', topics));
  const foot = document.createElement('div');
  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.textContent = 'Log';
  save.onclick = async () => {
    setLoading(save, true);
    try {
      await api('/learning/log', { method: 'POST', body: JSON.stringify({ topics: topics.value.trim(), date: new Date().toISOString().split('T')[0] }) });
      toast('Logged');
      closeSheet();
      await loadLearning(); renderBody();
    } catch (e) { toast('Failed: ' + e.message, true); }
    finally { setLoading(save, false); }
  };
  foot.appendChild(save);
  openSheet('Log today', body, foot);
}

function openUploadSheet() {
  const body = document.createElement('div');
  const name = input({ placeholder: 'filename.html' });
  const code = textarea({ placeholder: 'Paste HTML here\u2026' });
  code.style.minHeight = '220px';
  const fileInp = document.createElement('input');
  fileInp.type = 'file'; fileInp.accept = '.html,.htm,.pdf';
  fileInp.className = 'input';
  fileInp.onchange = () => {
    const f = fileInp.files[0];
    if (!f) return;
    if (!name.value) name.value = f.name;
    const reader = new FileReader();
    reader.onload = () => {
      if (f.name.endsWith('.pdf')) code.value = '[PDF will be uploaded as base64] ' + f.size + ' bytes';
      else code.value = reader.result;
    };
    if (f.name.endsWith('.pdf')) reader.readAsDataURL(f);
    else reader.readAsText(f);
  };
  body.appendChild(field('File (or paste below)', fileInp));
  body.appendChild(field('Filename', name));
  body.appendChild(field('Content', code));
  const foot = document.createElement('div');
  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.textContent = 'Upload';
  save.onclick = async () => {
    let content = code.value;
    const f = fileInp.files[0];
    if (f && f.name.endsWith('.pdf')) {
      const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      content = String(dataUrl).split(',')[1];
    }
    if (!name.value.trim() || !content) return toast('Filename and content required', true);
    setLoading(save, true);
    try {
      await api('/html/upload', { method: 'POST', body: JSON.stringify({ filename: name.value.trim(), content }) });
      toast('Uploaded');
      closeSheet();
      await loadVault(); renderSubnav(); renderBody();
    } catch (e) { toast('Failed: ' + e.message, true); }
    finally { setLoading(save, false); }
  };
  foot.appendChild(save);
  openSheet('Upload to vault', body, foot);
}

// ---------- command palette (feature 1) ----------
function openPalette() {
  if (state.paletteOpen) return;
  state.paletteOpen = true;
  state.paletteHi = 0;
  const backdrop = document.getElementById('palette-backdrop');
  const body = document.getElementById('palette-body');
  const input = document.getElementById('palette-input');
  if (!backdrop || !body || !input) return;
  backdrop.classList.add('open');
  body.innerHTML = '<div class="palette-empty">Start typing to search across everything</div>';
  setTimeout(() => { input.value = ''; input.focus(); }, 20);
  let lastResults = { groups: { recs: [], nodes: [], vault: [], patterns: [] } };
  let timer;
  const close = () => { state.paletteOpen = false; backdrop.classList.remove('open'); input.value = ''; };
  const onKey = (e) => {
    if (!state.paletteOpen) return;
    const items = $$('.palette-item', body);
    if (e.key === 'ArrowDown') { e.preventDefault(); state.paletteHi = Math.min(items.length - 1, state.paletteHi + 1); highlight(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); state.paletteHi = Math.max(0, state.paletteHi - 1); highlight(items); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[state.paletteHi]; if (it && it._go) it._go(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  const highlight = (items) => { items.forEach((el, i) => el.classList.toggle('highlighted', i === state.paletteHi)); if (items[state.paletteHi]) items[state.paletteHi].scrollIntoView({ block: 'nearest' }); };
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  const newOnKey = (e) => onKey(e);
  input.onkeydown = newOnKey;
  input.oninput = () => {
    clearTimeout(timer);
    const q = input.value.trim();
    timer = setTimeout(async () => {
      if (q.length < 2) { body.innerHTML = '<div class="palette-empty">Start typing to search across everything</div>'; lastResults = { groups: { recs: [], nodes: [], vault: [], patterns: [] } }; return; }
      try {
        const r = await api('/search?q=' + encodeURIComponent(q));
        lastResults = r; renderPaletteResults(r);
      } catch { body.innerHTML = '<div class="palette-empty">Search failed</div>'; }
    }, 120);
  };
  function renderPaletteResults(r) {
    let html = '';
    const groups = [
      ['Recs', r.groups.recs, 'rec'],
      ['Tree nodes', r.groups.nodes, 'node'],
      ['Vault', r.groups.vault, 'vault'],
      ['Patterns', r.groups.patterns, 'pattern'],
    ];
    for (const [title, items, kind] of groups) {
      if (!items || !items.length) continue;
      html += '<div class="palette-group"><div class="palette-group-title">' + esc(title) + '</div>';
      items.forEach((it, i) => {
        const main = kind === 'rec' ? it.title : kind === 'node' ? (it.label || it.id) : kind === 'vault' ? it.filename : it.description;
        const sub = kind === 'rec' ? (it.creator || '') : kind === 'node' ? (it.super_category || it.type) : kind === 'vault' ? ((it.created_at || '').slice(0, 10)) : (it.strength || '');
        const right = kind === 'rec' ? it.status : kind === 'node' ? it.id : '';
        html += '<div class="palette-item" data-kind="' + kind + '" data-idx="' + i + '"><span class="pi-icon">' +
          (kind === 'rec' ? '\u2605' : kind === 'node' ? '\u25C7' : kind === 'vault' ? '\u25EB' : '\u25C6') +
          '</span><span class="pi-title">' + esc(main) + (sub ? ' <span class="muted" style="font-size:11px">\u2014 ' + esc(sub) + '</span>' : '') + '</span><span class="pi-meta">' + esc(right) + '</span></div>';
      });
      html += '</div>';
    }
    if (!html) html = '<div class="palette-empty">No matches</div>';
    body.innerHTML = html;
    const items = $$('.palette-item', body);
    items.forEach(el => {
      const kind = el.dataset.kind, idx = parseInt(el.dataset.idx);
      const it = lastResults.groups[kind === 'pattern' ? 'patterns' : kind === 'rec' ? 'recs' : kind === 'node' ? 'nodes' : 'vault'][idx];
      el._go = () => {
        close();
        if (kind === 'rec') { setWorkspace('curate', 'all'); setTimeout(() => { const t = state.recs.find(x => x.id === it.id); if (t) openReviewSheet(t, t.status); }, 80); }
        else if (kind === 'node') { setWorkspace('map', 'canvas'); setTimeout(() => openNodeSheet(it.id), 80); }
        else if (kind === 'vault') { setWorkspace('log', 'vault'); }
        else if (kind === 'pattern') { setWorkspace('map', 'profile'); }
      };
      el.onclick = () => el._go && el._go();
    });
    state.paletteHi = 0; highlight(items);
  }
}
function closePalette() {
  if (!state.paletteOpen) return;
  state.paletteOpen = false;
  const bd = document.getElementById('palette-backdrop');
  if (bd) bd.classList.remove('open');
  const input = document.getElementById('palette-input');
  if (input) input.value = '';
}

// ---------- keymap overlay (feature 4) ----------
const KEYS = [
  { keys: ['\u2318 K', 'Ctrl K'], desc: 'Open command palette' },
  { keys: ['?'], desc: 'Show this overlay' },
  { keys: ['g c', 'g m', 'g l'], desc: 'Go to Curate / Map / Log' },
  { keys: ['1', '2', '3', '4', '5'], desc: 'Switch sub-view' },
  { keys: ['n'], desc: 'New entry (push sheet)' },
  { keys: ['j', 'k'], desc: 'Next / prev row' },
  { keys: ['c'], desc: 'Consume focused row' },
  { keys: ['x'], desc: 'Reject focused row' },
  { keys: ['r'], desc: 'Open review for focused' },
  { keys: ['e'], desc: 'Edit focused row' },
  { keys: ['/'], desc: 'Focus search' },
  { keys: ['Esc'], desc: 'Close sheet / modal / palette' },
];
function openKeymap() {
  const c = document.createElement('div');
  c.innerHTML = '<h2 style="margin-bottom:14px">Keyboard shortcuts</h2>' +
    '<div class="kbd-table">' + KEYS.map(k =>
      '<div class="kbd-row"><div class="kbd-keys">' + k.keys.map(x => '<kbd>' + esc(x) + '</kbd>').join('') + '</div><div class="kbd-desc">' + esc(k.desc) + '</div></div>'
    ).join('') + '</div>';
  openModal(c, false);
}
function getFocusedRow() {
  const cards = $$('.queue-card, .archive-item, .branch-card, .vault-row');
  if (!cards.length) return null;
  return cards[Math.min(state.focusedRow, cards.length - 1)];
}

// ---------- CURATE views ----------
const VIEWS = {};

// feature 2: filters bar
const CONTENT_TYPES = ['video', 'book', 'article', 'podcast', 'paper', 'course', 'other'];
const RATINGS = ['love', 'like', 'meh', 'dislike'];
function renderFiltersBar() {
  const bar = document.getElementById('filters-bar');
  if (!bar) return;
  if (state.ws !== 'curate' || state.sub.curate === 'archive') { bar.hidden = true; return; }
  bar.hidden = false;
  let html = '<span class="dim" style="font-size:11px;margin-right:4px">Type:</span>';
  CONTENT_TYPES.forEach(t => {
    const on = state.filters.content_type.has(t);
    html += '<span class="chip chip-toggle ' + (on ? 'chip-on' : '') + '" data-f="type" data-v="' + esc(t) + '">' + esc(t) + '</span>';
  });
  html += '<span class="dim" style="font-size:11px;margin:0 4px 0 12px">Rating:</span>';
  RATINGS.forEach(r => {
    const on = state.filters.rating.has(r);
    html += '<span class="chip chip-toggle ' + (on ? 'chip-on' : '') + '" data-f="rating" data-v="' + esc(r) + '">' + esc(r) + '</span>';
  });
  html += '<span class="chip chip-toggle ' + (state.filters.since ? 'chip-on' : '') + '" data-f="since">Last 7d</span>';
  html += '<span class="chip chip-toggle ' + (state.filters.has_why ? 'chip-on' : '') + '" data-f="why">Has why</span>';
  html += '<input class="filter-input" id="creator-filter" placeholder="Creator\u2026" value="' + esc(state.filters.creator) + '" />';
  const anyOn = state.filters.content_type.size || state.filters.rating.size || state.filters.since || state.filters.has_why || state.filters.creator;
  if (anyOn) html += '<span class="chip chip-toggle chip-on" data-f="reset">Reset</span>';
  bar.innerHTML = html;
  bar.onclick = (e) => {
    const c = e.target.closest('[data-f]');
    if (!c) return;
    const f = c.dataset.f, v = c.dataset.v;
    if (f === 'type') { if (state.filters.content_type.has(v)) state.filters.content_type.delete(v); else state.filters.content_type.add(v); }
    else if (f === 'rating') { if (state.filters.rating.has(v)) state.filters.rating.delete(v); else state.filters.rating.add(v); }
    else if (f === 'since') { state.filters.since = state.filters.since ? null : new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]; }
    else if (f === 'why') { state.filters.has_why = !state.filters.has_why; }
    else if (f === 'reset') { state.filters = { content_type: new Set(), rating: new Set(), since: null, has_why: false, creator: '' }; }
    renderFiltersBar(); renderBody();
  };
  const ci = document.getElementById('creator-filter');
  if (ci) ci.oninput = () => { state.filters.creator = ci.value; renderBody(); };
}
function applyFilters(items) {
  if (state.filters.content_type.size) items = items.filter(r => state.filters.content_type.has(r.content_type));
  if (state.filters.rating.size) items = items.filter(r => state.filters.rating.has(r.user_rating));
  if (state.filters.since) items = items.filter(r => (r.created_at || '').slice(0, 10) >= state.filters.since);
  if (state.filters.has_why) items = items.filter(r => r.why_this && r.why_this.trim());
  if (state.filters.creator) items = items.filter(r => (r.creator || '').toLowerCase().includes(state.filters.creator.toLowerCase()));
  return items;
}

// feature 3: batch bar
function updateBatchBar() {
  const bar = document.getElementById('batch-bar');
  if (!bar) return;
  const visible = state.ws === 'curate' && state.sub.curate !== 'archive' && state.selection.size > 0;
  bar.classList.toggle('open', visible);
  const c = document.getElementById('batch-count');
  if (c) c.textContent = state.selection.size + ' selected';
}
function toggleSelect(id, checked) {
  if (checked) state.selection.add(id); else state.selection.delete(id);
  updateBatchBar();
}

VIEWS['curate.queue'] = (body) => {
  const q = state.search.toLowerCase();
  let items = state.recs.filter(r => r.status === 'active');
  items = applyFilters(items);
  if (q) items = items.filter(r => (r.video_title || '').toLowerCase().includes(q) || (r.creator || '').toLowerCase().includes(q) || (r.why_this || '').toLowerCase().includes(q));
  if (!items.length) {
    body.innerHTML = '<div class="empty">' +
      '<svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>' +
      '<div class="e-title">Queue is clear</div><div>Nothing waiting for review. Push something new or let the curator pipeline refill it.</div>' +
      '<button class="btn btn-primary" onclick="window.__new()">New entry</button></div>';
    window.__new = openPushSheet;
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'queue';
  items.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'queue-card';
    card.style.animationDelay = Math.min(i * 30, 300) + 'ms';
    card.dataset.fid = r.id;
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'chk';
    cb.checked = state.selection.has(r.id);
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => toggleSelect(r.id, cb.checked);
    const dot = document.createElement('span'); dot.className = 'dot dot-active q-dot';
    const main = document.createElement('div'); main.className = 'q-main';
    main.innerHTML =
      '<div class="q-title">' + esc(r.video_title) + '</div>' +
      '<div class="q-meta"><span>' + esc(r.creator || 'Unknown') + '</span>' +
      (r.content_type ? '<span class="chip">' + esc(r.content_type) + '</span>' : '') +
      (r.synergy_bundle_id && r.synergy_bundle_id !== 'unset' ? '<span class="chip chip-accent">' + esc(r.synergy_bundle_id) + '</span>' : '') +
      (r.verified && r.verified !== 'unset' ? '<span class="mono">' + age(r.verified) + ' old</span>' : '') +
      '</div>' +
      (r.why_this ? '<div class="q-why">' + esc(r.why_this) + '</div>' : '');
    const acts = document.createElement('div'); acts.className = 'q-actions';
    const open = document.createElement('a');
    open.className = 'btn btn-ghost btn-icon';
    open.href = r.video_url; open.target = '_blank'; open.rel = 'noopener';
    open.title = 'Open';
    open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
    const reject = document.createElement('button');
    reject.className = 'btn btn-ghost btn-danger';
    reject.textContent = 'Reject';
    reject.onclick = () => openReviewSheet(r, 'rejected');
    const consume = document.createElement('button');
    consume.className = 'btn btn-primary';
    consume.textContent = 'Consume';
    consume.onclick = () => openReviewSheet(r, 'consumed');
    acts.append(open, reject, consume);
    card.append(cb, dot, main, acts);
    wrap.appendChild(card);
  });
  body.appendChild(wrap);
};

VIEWS['curate.archive'] = (body) => {
  const q = state.search.toLowerCase();
  let items = state.recs.filter(r => r.status === 'consumed');
  if (q) items = items.filter(r => (r.video_title || '').toLowerCase().includes(q) || (r.creator || '').toLowerCase().includes(q));
  items.sort((a, b) => (b.consumed_date || '').localeCompare(a.consumed_date || ''));
  if (!items.length) {
    body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg><div class="e-title">Nothing consumed yet</div><div>Consumed items with ratings and reviews land here as your archive.</div></div>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'archive';
  let lastDay = '';
  items.forEach(r => {
    const day = (r.consumed_date || '').slice(0, 10) || 'unknown';
    if (day !== lastDay) {
      lastDay = day;
      const d = document.createElement('div');
      d.className = 'archive-day';
      d.innerHTML = '<div class="archive-date">' + esc(fmtDate(day)) + '</div>';
      wrap.appendChild(d);
    }
    const dayEl = wrap.lastChild;
    const item = document.createElement('div');
    item.className = 'archive-item';
    const rating = (r.user_rating && r.user_rating !== 'unset')
      ? '<span class="rating-tag rating-' + esc(r.user_rating) + '">' + esc(r.user_rating) + '</span>'
      : '';
    item.innerHTML =
      '<span class="dot dot-consumed" style="margin-top:6px"></span>' +
      '<div>' +
      '<div class="a-title">' + esc(r.video_title) + '</div>' +
      '<div class="a-meta">' + esc(r.creator || 'Unknown') + (r.content_type ? ' \xB7 ' + esc(r.content_type) : '') + '</div>' +
      (r.user_review ? '<div class="a-review">' + esc(r.user_review) + '</div>' : '') +
      '</div>' +
      '<div>' + rating + '</div>';
    dayEl.appendChild(item);
  });
  body.appendChild(wrap);
};

VIEWS['curate.all'] = (body) => {
  const q = state.search.toLowerCase();
  let items = state.recs.slice();
  items = applyFilters(items);
  if (q) items = items.filter(r => (r.video_title || '').toLowerCase().includes(q) || (r.creator || '').toLowerCase().includes(q));
  if (!items.length) {
    body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div class="e-title">No entries</div></div>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'queue';
  items.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'queue-card';
    card.style.animation = 'none';
    card.dataset.fid = r.id;
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'chk';
    cb.checked = state.selection.has(r.id);
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => toggleSelect(r.id, cb.checked);
    card.innerHTML =
      '<span class="dot dot-' + esc(r.status) + ' q-dot"></span>' +
      '<div class="q-main">' +
      '<div class="q-title">' + esc(r.video_title) + '</div>' +
      '<div class="q-meta"><span>' + esc(r.creator || 'Unknown') + '</span>' +
      (r.content_type ? '<span class="chip">' + esc(r.content_type) + '</span>' : '') +
      (r.user_rating && r.user_rating !== 'unset' ? '<span class="rating-tag rating-' + esc(r.user_rating) + '">' + esc(r.user_rating) + '</span>' : '') +
      '</div></div>';
    const acts = document.createElement('div');
    acts.className = 'q-actions';
    const open = document.createElement('a');
    open.className = 'btn btn-ghost btn-icon';
    open.href = r.video_url; open.target = '_blank'; open.rel = 'noopener';
    open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
    const edit = document.createElement('button');
    edit.className = 'btn btn-ghost';
    edit.textContent = 'Edit';
    edit.onclick = () => openReviewSheet(r, r.status);
    acts.append(open, edit);
    card.insertBefore(cb, card.firstChild);
    card.appendChild(acts);
    wrap.appendChild(card);
  });
  body.appendChild(wrap);
};

// feature 5: curate resurfacing
VIEWS['curate.resurfacing'] = (body) => {
  const health = state.brain.health;
  const wrap = document.createElement('div'); wrap.style.maxWidth = '880px';
  if (health && health.stale && health.stale.length) {
    const t = document.createElement('div'); t.className = 'sec-title'; t.innerHTML = 'Stale queue items <span class="count">' + health.stale.length + '</span>';
    wrap.appendChild(t);
    health.stale.slice(0, 30).forEach(s => {
      const el = document.createElement('div'); el.className = 'archive-item';
      el.innerHTML = '<span class="dot dot-active" style="margin-top:6px"></span><div><div class="a-title" style="font-size:13px">' + esc(s.video_title) + '</div><div class="a-meta">' + esc(s.creator || '') + ' \xB7 queued ' + esc(fmtDate(s.verified)) + '</div></div><div></div>';
      wrap.appendChild(el);
    });
  }
  if (health && health.byBranch && health.byBranch.length) {
    const t = document.createElement('div'); t.className = 'sec-title'; t.innerHTML = 'Branch engagement <span class="count">' + health.byBranch.length + '</span>';
    wrap.appendChild(t);
    const max = Math.max(...health.byBranch.map(b => b.consumed_count), 1);
    health.byBranch.slice(0, 15).forEach(b => {
      const row = document.createElement('div'); row.className = 'bar-row';
      row.innerHTML = '<span class="b-label mono">' + esc(b.branch) + '</span><div class="b-track"><div class="b-fill c-consumed" style="width:' + Math.round(b.consumed_count / max * 100) + '%"></div></div><span class="b-count">' + b.consumed_count + '</span>';
      wrap.appendChild(row);
    });
  }
  if ((!health || !health.stale || !health.stale.length) && (!health || !health.byBranch || !health.byBranch.length)) {
    wrap.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6-8.24"/><path d="M21 3v6h-6"/></svg><div class="e-title">Nothing to resurface</div><div>All branches engaged, no stale items.</div></div>';
  }
  body.appendChild(wrap);
};

// ---------- MAP views ----------
VIEWS['map.canvas'] = (body) => {
  const nodes = (state.brain.tree && state.brain.tree.nodes) || [];
  const withPos = nodes.filter(n => typeof n.x === 'number' && typeof n.y === 'number');
  if (!withPos.length) {
    body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><div class="e-title">No map data</div><div>Seed the tree via the API to see the canvas.</div></div>';
    return;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  withPos.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
  const pad = 300;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const w = maxX - minX, h = maxY - minY;

  const stage = document.createElement('div');
  stage.className = 'canvas-stage';
  const inner = document.createElement('div');
  inner.className = 'canvas-inner';
  inner.style.width = w + 'px';
  inner.style.height = h + 'px';

  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'canvas-edges');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  withPos.forEach(n => {
    if (!n.parent_id || !byId[n.parent_id]) return;
    const p = byId[n.parent_id];
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return;
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', p.x - minX); l.setAttribute('y1', p.y - minY);
    l.setAttribute('x2', n.x - minX); l.setAttribute('y2', n.y - minY);
    l.setAttribute('class', 'canvas-edge');
    svg.appendChild(l);
  });
  inner.appendChild(svg);

  withPos.forEach(n => {
    const el = document.createElement('div');
    el.className = 'canvas-node cn-' + (n.type || 'leaf') + (n.status ? ' s-' + n.status : '');
    el.style.left = (n.x - minX) + 'px';
    el.style.top = (n.y - minY) + 'px';
    el.textContent = n.label || n.id;
    el.dataset.nid = n.id;
    el.onclick = (e) => { e.stopPropagation(); openNodeSheet(n.id); };
    // feature 7: hover dim + dblclick filter
    el.addEventListener('mouseenter', () => {
      $$('.canvas-node', stage).forEach(x => { if (x !== el) x.classList.add('dim'); });
      el.classList.add('focused');
      // Path highlight: dim nodes not on path to root
      const path = new Set();
      let cur = n;
      while (cur) { path.add(cur.id); cur = cur.parent_id ? byId[cur.parent_id] : null; }
      $$('.canvas-node', stage).forEach(x => {
        const nid = x.dataset.nid;
        if (!path.has(nid)) x.classList.add('path-dim');
      });
    });
    el.addEventListener('mouseleave', () => {
      $$('.canvas-node', stage).forEach(x => { x.classList.remove('dim'); x.classList.remove('path-dim'); });
      el.classList.remove('focused');
    });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      setWorkspace('curate', 'all');
      state.search = (n.id || '').split('-')[0];
      setTimeout(() => { state.search = (n.id || '').split('-')[0]; renderBody(); }, 30);
    });
    inner.appendChild(el);
  });

  stage.appendChild(inner);
  body.appendChild(stage);

  // feature 7: canvas mini-search
  const search = document.createElement('input');
  search.className = 'input canvas-search';
  search.placeholder = 'Find node\u2026';
  stage.appendChild(search);
  const searchResults = document.createElement('div');
  searchResults.className = 'canvas-search-results';
  stage.appendChild(searchResults);
  search.oninput = () => {
    const q = search.value.toLowerCase().trim();
    if (q.length < 2) { searchResults.classList.remove('open'); searchResults.innerHTML = ''; return; }
    const matches = nodes.filter(n => (n.label || n.id || '').toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { searchResults.classList.remove('open'); searchResults.innerHTML = ''; return; }
    searchResults.classList.add('open');
    searchResults.innerHTML = matches.map(n =>
      '<div class="palette-item" data-id="' + esc(n.id) + '"><span class="pi-icon">\u25C7</span><span class="pi-title">' + esc(n.label || n.id) + '</span><span class="pi-meta">' + esc(n.id) + '</span></div>'
    ).join('');
    $$('.palette-item', searchResults).forEach(el => {
      el.onclick = () => { openNodeSheet(el.dataset.id); searchResults.classList.remove('open'); search.value = ''; };
    });
  };

  const ctrls = document.createElement('div');
  ctrls.className = 'canvas-ctrls';
  ctrls.innerHTML = '<button class="canvas-btn" data-a="in">+</button><button class="canvas-btn" data-a="out">\u2212</button><button class="canvas-btn" data-a="reset">\u2922</button>';
  stage.appendChild(ctrls);

  const fit = () => {
    const rect = stage.getBoundingClientRect();
    return Math.min(rect.width / w, rect.height / h, 1.5) * 0.95;
  };
  let scale = fit(), tx = 20, ty = 20;
  const apply = () => { inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; };
  const center = () => {
    const rect = stage.getBoundingClientRect();
    tx = (rect.width - w * scale) / 2;
    ty = (rect.height - h * scale) / 2;
  };
  center();
  apply();

  ctrls.querySelector('[data-a="in"]').onclick = () => { scale = Math.min(3, scale * 1.25); apply(); };
  ctrls.querySelector('[data-a="out"]').onclick = () => { scale = Math.max(0.05, scale / 1.25); apply(); };
  ctrls.querySelector('[data-a="reset"]').onclick = () => { scale = fit(); center(); apply(); };

  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.canvas-node') || e.target.closest('.canvas-btn')) return;
    dragging = true; sx = e.clientX; sy = e.clientY; ox = tx; oy = ty;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx = ox + (e.clientX - sx); ty = oy + (e.clientY - sy);
    apply();
  });
  stage.addEventListener('pointerup', () => { dragging = false; });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const rect = stage.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const newScale = Math.max(0.05, Math.min(3, scale * d));
    tx = mx - ((mx - tx) / scale) * newScale;
    ty = my - ((my - ty) / scale) * newScale;
    scale = newScale;
    apply();
  }, { passive: false });
};

async function openNodeSheet(id) {
  const body = document.createElement('div');
  body.innerHTML = '<div class="loading-skeleton"><div class="skel skel-row"></div></div>';
  openSheet('Loading\u2026', body, null);
  try {
    const d = await api('/brain/node/' + encodeURIComponent(id));
    const n = d.node;
    const head = $('#sheet .sheet-head h2');
    if (head) head.textContent = n.label || n.id;
    body.innerHTML =
      '<div class="q-meta" style="margin-bottom:14px">' +
      '<span class="chip chip-accent">' + esc(n.type) + '</span>' +
      (n.status ? '<span class="chip">' + esc(n.status) + '</span>' : '') +
      (n.super_category ? '<span class="chip">' + esc(n.super_category.replace('cat-', '')) + '</span>' : '') +
      '<span class="mono dim">' + esc(n.id) + '</span></div>';
    if (d.children && d.children.length) {
      const t = document.createElement('div');
      t.className = 'sec-title';
      t.innerHTML = 'Children <span class="count">' + d.children.length + '</span>';
      body.appendChild(t);
      d.children.forEach(c => {
        const el = document.createElement('div');
        el.className = 'branch-card';
        el.style.marginBottom = '6px';
        el.innerHTML = '<div class="bc-id">' + esc(c.id) + '</div><div class="bc-label">' + esc(c.label || c.id) + '</div>';
        el.onclick = () => openNodeSheet(c.id);
        body.appendChild(el);
      });
    }
    if (d.related_recs && d.related_recs.length) {
      const t = document.createElement('div');
      t.className = 'sec-title';
      t.innerHTML = 'Recommendations <span class="count">' + d.related_recs.length + '</span>';
      body.appendChild(t);
      d.related_recs.forEach(r => {
        const el = document.createElement('div');
        el.className = 'archive-item';
        el.style.padding = '8px 0';
        el.innerHTML =
          '<span class="dot dot-' + esc(r.status) + '" style="margin-top:6px"></span>' +
          '<div><div class="a-title" style="font-size:13px">' + esc(r.video_title || 'Untitled') + '</div>' +
          '<div class="a-meta">' + esc(r.creator || '') + (r.user_rating && r.user_rating !== 'unset' ? ' \xB7 ' + esc(r.user_rating) : '') + '</div></div>' +
          '<div></div>';
        body.appendChild(el);
      });
    }
    if ((!d.children || !d.children.length) && (!d.related_recs || !d.related_recs.length)) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.innerHTML = '<div class="e-title">Leaf node</div><div>No children or linked recommendations.</div>';
      body.appendChild(p);
    }
  } catch (e) {
    body.innerHTML = '<div class="empty">Failed to load node.</div>';
  }
}

// feature 14: branches health panel
VIEWS['map.branches'] = (body) => {
  const nodes = (state.brain.tree && state.brain.tree.nodes) || [];
  const branches = nodes.filter(n => n.type === 'branch');
  const health = (state.brain.health && state.brain.health.byBranch) || [];
  const mastery = (state.brain.health && state.brain.health.mastery) || [];
  const hmap = {}; health.forEach(h => { hmap[h.branch] = h; });
  const mmap = {}; mastery.forEach(m => { mmap[m.branch] = m; });
  const q = state.search.toLowerCase();
  let list = branches;
  if (q) list = list.filter(b => (b.label || '').toLowerCase().includes(q) || b.id.includes(q));
  if (state.branchSort === 'count') list = list.slice().sort((a, b) => (hmap[b.id] ? hmap[b.id].consumed_count : 0) - (hmap[a.id] ? hmap[a.id].consumed_count : 0));
  else list = list.slice().sort((a, b) => ((hmap[a.id] && hmap[a.id].last_consumed) || '9999').localeCompare((hmap[b.id] && hmap[b.id].last_consumed) || '9999'));
  if (!list.length) { body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><div class="e-title">No branches</div></div>'; return; }
  const sort = document.createElement('div');
  sort.className = 'branch-sort';
  sort.innerHTML = '<button class="btn btn-sm ' + (state.branchSort === 'recency' ? 'btn-primary' : 'btn-ghost') + '" data-sort="recency">By recency</button>' +
    '<button class="btn btn-sm ' + (state.branchSort === 'count' ? 'btn-primary' : 'btn-ghost') + '" data-sort="count">By consumption</button>';
  body.appendChild(sort);
  sort.onclick = (e) => { const b = e.target.closest('[data-sort]'); if (!b) return; state.branchSort = b.dataset.sort; renderBody(); };
  const byCat = {}; list.forEach(b => { const k = b.super_category || 'other'; (byCat[k] = byCat[k] || []).push(b); });
  const order = ['cat-faith', 'cat-mind', 'cat-body', 'cat-money', 'cat-life', 'cat-tools'];
  order.push(...Object.keys(byCat).filter(k => !order.includes(k)));
  order.forEach(cat => {
    if (!byCat[cat]) return;
    const t = document.createElement('div');
    t.className = 'sec-title';
    t.textContent = cat.replace('cat-', '');
    body.appendChild(t);
    const grid = document.createElement('div'); grid.className = 'branch-list';
    byCat[cat].forEach(b => {
      const h = hmap[b.id] || hmap[b.id.split('-')[0]] || null;
      const m = mmap[b.id] || mmap[b.id.split('-')[0]] || null;
      const ageDays = h && h.last_consumed ? Math.floor((Date.now() - new Date(h.last_consumed).getTime()) / 86400000) : null;
      const ageClass = ageDays == null ? '' : ageDays < 30 ? 'fresh' : ageDays < 90 ? 'warm' : 'stale';
      const ageTxt = ageDays == null ? 'not started' : (ageDays === 0 ? 'today' : ageDays < 30 ? ageDays + 'd' : Math.floor(ageDays / 30) + 'mo');
      const stale = ageDays != null && ageDays > 60;
      const masteryPct = m && m.total ? Math.round(m.mastered / m.total * 100) : 0;
      const el = document.createElement('div');
      el.className = 'branch-card';
      el.innerHTML =
        '<div class="bc-id">' + esc(b.id) + '</div>' +
        '<div class="bc-label">' + esc(b.label || b.id) + (stale ? '<span class="bc-stale-pulse" title="stale"></span>' : '') + '</div>' +
        (h ? '<div class="bc-meta">' + h.consumed_count + ' consumed \xB7 avg ' + (h.avg_rating ? Number(h.avg_rating).toFixed(1) : '\u2014') + ' \xB7 <span class="bc-age ' + ageClass + '">' + ageTxt + '</span></div>' : '<div class="bc-meta">not started</div>') +
        (m ? '<div class="bc-mastery"><div class="bar-mini"><div class="bar-mini-fill" style="width:' + masteryPct + '%"></div></div><span>' + masteryPct + '% mastery</span></div>' : '');
      el.onclick = () => openNodeSheet(b.id);
      grid.appendChild(el);
    });
    body.appendChild(grid);
  });
};

// feature 6: taste radar
VIEWS['map.radar'] = (body) => {
  const nodes = (state.brain.tree && state.brain.tree.nodes) || [];
  const recs = state.recs;
  const byCat = {}; nodes.forEach(n => { if (n.super_category) (byCat[n.super_category] = byCat[n.super_category] || []).push(n); });
  const cats = Object.keys(byCat);
  if (!cats.length) { body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z"/></svg><div class="e-title">No branches yet</div><div>Seed the tree to see drift analysis.</div></div>'; return; }
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const rows = cats.map(cat => {
    const branchIds = byCat[cat].map(n => n.id);
    const prefix = (id) => branchIds.some(b => id.startsWith(b + '-') || id === b);
    const consumed = recs.filter(r => r.status === 'consumed' && prefix(r.dedup_key || ''));
    const recent = recs.filter(r => (r.created_at || '').slice(0, 10) >= last30 && prefix(r.dedup_key || ''));
    const locked = consumed.filter(r => r.user_rating === 'love' || r.user_rating === 'like');
    const lockedShare = consumed.length ? locked.length / consumed.length : 0;
    const recentShare = recent.length ? 1 : 0;
    const drift = recentShare - lockedShare;
    return { cat: cat.replace('cat-', ''), drift, locked: lockedShare, recent: recentShare, consumed: consumed.length, recent_n: recent.length };
  }).sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  const wrap = document.createElement('div');
  wrap.style.maxWidth = '880px';
  wrap.innerHTML = '<div class="muted" style="font-size:12px;margin-bottom:14px">Drift = (recent pushes in branch) \u2212 (share of consumed that were love/like). Positive = you are exploring this branch; negative = you have locked in.</div>';
  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'radar-bar';
    const mag = Math.min(1, Math.abs(r.drift));
    const w = Math.round(mag * 50);
    row.innerHTML =
      '<span style="font-size:13px;font-weight:500">' + esc(r.cat) + '</span>' +
      '<div class="radar-track">' +
      (r.drift > 0
        ? '<div class="radar-fill-right" style="width:' + w + '%"></div>'
        : '<div class="radar-fill-left" style="width:' + w + '%"></div>') +
      '</div>' +
      '<span class="radar-delta ' + (r.drift > 0 ? 'pos' : r.drift < 0 ? 'neg' : '') + '">' + (r.drift > 0 ? '+' : '') + r.drift.toFixed(2) + '</span>';
    wrap.appendChild(row);
  });
  body.appendChild(wrap);
};

// feature 12: pattern meter (rewritten cleanly)
VIEWS['map.profile'] = (body) => {
  const P = state.brain.profile;
  if (!P || !P.profile) {
    body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg><div class="e-title">No profile</div><div>Seed the brain to populate identity, priorities, patterns.</div></div>';
    return;
  }
  const pri = P.priorities || [];
  const patterns = P.patterns || [];
  const mastered = P.mastered || [];
  const blacklist = P.blacklist || [];
  const wrap = document.createElement('div');
  wrap.className = 'profile-grid';

  if (P.profile.core_filter || P.profile.identity_json) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = '<h3 style="margin-bottom:8px">Core filter</h3><div class="muted" style="font-size:13px;line-height:1.6">' + esc(P.profile.core_filter || P.profile.identity_json || '\u2014') + '</div>';
    wrap.appendChild(c);
  }

  if (pri.length) {
    const c = document.createElement('div');
    c.className = 'card';
    let h = '<h3 style="margin-bottom:8px">Priority order</h3><ol class="pri-list">';
    pri.forEach(p => {
      h += '<li><span class="pri-rank">#' + p.rank + '</span><span class="pri-id">' + esc(p.branch_id) + '</span><span>' + esc(p.label || '') + '</span></li>';
    });
    c.innerHTML = h + '</ol>';
    wrap.appendChild(c);
  }

  if (patterns.length) {
    const c = document.createElement('div');
    c.className = 'card';
    let h = '<h3 style="margin-bottom:8px">Patterns <span class="count">' + patterns.length + '</span></h3>';
    patterns.forEach(p => {
      h += '<div class="pattern-row"><div class="pattern-head"><span class="strength-tag strength-' + esc(p.strength || 'confirmed') + '">' + esc(p.strength || 'confirmed') + '</span><span class="mono dim" style="font-size:11px">' + esc(p.id) + '</span></div>' +
        '<div class="pattern-desc">' + esc(p.description) + '</div>' +
        (p.confirmed_date ? '<div class="pattern-date">' + esc(p.confirmed_date) + '</div>' : '') +
        '<div class="pattern-actions">' +
        '<div class="strength-meter">' + ['weak','confirmed','locked'].map(s =>
          '<button class="pt-btn' + ((p.strength || 'confirmed') === s ? ' pt-active' : '') + '" data-s="' + s + '" data-pid="' + esc(p.id) + '">' + s + '</button>'
        ).join('') + '</div></div></div>';
    });
    c.innerHTML = h;
    wrap.appendChild(c);
  }

  if (mastered.length) {
    const c = document.createElement('div');
    c.className = 'card';
    let h = '<h3 style="margin-bottom:8px">Mastered <span class="count">' + mastered.length + '</span></h3>';
    mastered.slice(0, 10).forEach(m => {
      h += '<div style="padding:5px 0;border-bottom:1px solid var(--border)"><span class="mono" style="font-size:11px;color:var(--consumed)">' + esc(m.id) + '</span> <span style="font-size:13px">' + esc(m.label) + '</span>' +
        (m.author ? ' <span class="dim" style="font-size:12px">\u2014 ' + esc(m.author) + '</span>' : '') + '</div>';
    });
    c.innerHTML = h;
    wrap.appendChild(c);
  }

  if (blacklist.length) {
    const c = document.createElement('div');
    c.className = 'card';
    let h = '<h3 style="margin-bottom:8px">Blacklist <span class="count">' + blacklist.length + '</span></h3>';
    blacklist.slice(0, 10).forEach(b => {
      h += '<div style="padding:5px 0;border-bottom:1px solid var(--border)"><span style="font-weight:600;font-size:13px">' + esc(b.name) + '</span>' +
        (b.work ? ' <span class="dim" style="font-size:12px;font-style:italic">\u2014 ' + esc(b.work) + '</span>' : '') +
        (b.reason ? '<div class="dim" style="font-size:11px;margin-top:2px">' + esc(b.reason) + '</div>' : '') + '</div>';
    });
    c.innerHTML = h;
    wrap.appendChild(c);
  }

  body.appendChild(wrap);
  body.onclick = async (e) => {
    const b = e.target.closest('.pt-btn'); if (!b) return;
    try {
      await api('/brain/pattern/strength', { method: 'POST', body: JSON.stringify({ id: b.dataset.pid, strength: b.dataset.s }) });
      toast('Pattern strength: ' + b.dataset.s);
      await loadBrain();
      renderBody();
    } catch (e2) { toast('Failed: ' + e2.message, true); }
  };
};

VIEWS['map.resurfacing'] = (body) => {
  const health = state.brain.health;
  const wrap = document.createElement('div');
  wrap.style.maxWidth = '880px';

  if (health && health.stale && health.stale.length) {
    const t = document.createElement('div');
    t.className = 'sec-title';
    t.innerHTML = 'Stale queue items <span class="count">' + health.stale.length + '</span>';
    wrap.appendChild(t);
    const sub = document.createElement('div');
    sub.className = 'muted';
    sub.style.cssText = 'font-size:12px;margin-bottom:10px';
    sub.textContent = 'Active items older than 30 days \u2014 review or reject them.';
    wrap.appendChild(sub);
    health.stale.slice(0, 20).forEach(s => {
      const el = document.createElement('div');
      el.className = 'archive-item';
      el.innerHTML =
        '<span class="dot dot-active" style="margin-top:6px"></span>' +
        '<div><div class="a-title" style="font-size:13px">' + esc(s.video_title) + '</div>' +
        '<div class="a-meta">' + esc(s.creator || '') + ' \xB7 queued ' + esc(fmtDate(s.verified)) + '</div></div>' +
        '<div></div>';
      wrap.appendChild(el);
    });
  }

  if (health && health.byBranch && health.byBranch.length) {
    const t = document.createElement('div');
    t.className = 'sec-title';
    t.innerHTML = 'Branch engagement <span class="count">' + health.byBranch.length + '</span>';
    wrap.appendChild(t);
    const max = Math.max(...health.byBranch.map(b => b.consumed_count), 1);
    health.byBranch.slice(0, 15).forEach(b => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<span class="b-label mono">' + esc(b.branch) + '</span>' +
        '<div class="b-track"><div class="b-fill c-consumed" style="width:' + Math.round(b.consumed_count / max * 100) + '%"></div></div>' +
        '<span class="b-count">' + b.consumed_count + '</span>';
      wrap.appendChild(row);
    });
  }

  if ((!health || !health.stale || !health.stale.length) && (!health || !health.byBranch || !health.byBranch.length)) {
    wrap.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6-8.24"/><path d="M21 3v6h-6"/></svg><div class="e-title">Nothing to resurface</div><div>All branches engaged, no stale items.</div></div>';
  }
  body.appendChild(wrap);
};

// feature 8: tensions
VIEWS['map.tensions'] = async (body) => {
  body.innerHTML = '<div class="loading-skeleton"><div class="skel skel-row"></div><div class="skel skel-row"></div></div>';
  let list = [];
  try { const j = await api('/brain/contradictions'); list = j.contradictions || []; } catch {}
  if (!list.length) { body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 6 5.5l2-5.5 10 7-4.71 2.14M14 18l-5.5 4 2-7-6-3.5 7-1.5L12 2l3.5 6.5 7 1.5-6 3.5 2 7z"/></svg><div class="e-title">No unresolved tensions</div><div>Conflicting claims across your consumed sources will appear here.</div></div>'; return; }
  const wrap = document.createElement('div'); wrap.style.maxWidth = '980px';
  list.forEach(t => {
    const c = document.createElement('div');
    c.className = 'tension-card';
    c.innerHTML =
      '<div><div class="t-source">' + esc(t.source_a || '\u2014') + '</div><div class="t-meta">A</div></div>' +
      '<div class="tension-vs">vs</div>' +
      '<div><div class="t-source">' + esc(t.source_b || '\u2014') + '</div><div class="t-meta">B</div></div>' +
      '<div><button class="btn btn-sm btn-ghost" data-resolve="' + esc(t.id) + '">Resolve</button></div>' +
      '<div class="tension-body"><span class="tension-topic">' + esc(t.topic || 'unclear') + '</span> \u2014 ' + esc(t.tension || '') + '</div>';
    wrap.appendChild(c);
  });
  body.innerHTML = '';
  body.appendChild(wrap);
  body.onclick = async (e) => {
    const b = e.target.closest('[data-resolve]'); if (!b) return;
    try {
      await api('/brain/contradiction/resolve', { method: 'POST', body: JSON.stringify({ id: b.dataset.resolve }) });
      toast('Resolved');
      VIEWS['map.tensions'](body);
    } catch (e2) { toast('Failed: ' + e2.message, true); }
  };
};

// feature 15: mega composer
VIEWS['map.mega'] = (body) => {
  const P = state.brain.profile && state.brain.profile.profile;
  const pri = (state.brain.profile && state.brain.profile.priorities) || [];
  const wrap = document.createElement('div');
  wrap.style.maxWidth = '720px';
  const sec1 = document.createElement('div'); sec1.className = 'mega-section';
  sec1.innerHTML = '<h3>Core filter</h3>';
  const ta = document.createElement('textarea'); ta.className = 'mega-textarea';
  ta.value = (P && (P.core_filter || P.identity_json)) || '';
  // Auto-resize
  const autoResize = () => { ta.style.height = 'auto'; ta.style.height = Math.max(140, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', autoResize);
  setTimeout(autoResize, 10);
  sec1.appendChild(ta);
  const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-primary'; saveBtn.style.marginTop = '8px'; saveBtn.textContent = 'Save filter';
  saveBtn.onclick = async () => {
    try { await api('/brain/profile', { method: 'POST', body: JSON.stringify({ core_filter: ta.value }) }); toast('Saved'); await loadBrain(); } catch (e) { toast('Failed: ' + e.message, true); }
  };
  sec1.appendChild(saveBtn);
  wrap.appendChild(sec1);

  const sec2 = document.createElement('div'); sec2.className = 'mega-section';
  sec2.innerHTML = '<h3>Priority order <span class="count" id="pri-count">' + pri.length + '</span></h3>';
  const list = document.createElement('div'); list.id = 'pri-list';
  pri.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'pri-row'; row.draggable = true; row.dataset.idx = String(i);
    row.innerHTML = '<span class="pri-handle">\u22EE\u22EE</span><span class="pri-rank">#' + (i + 1) + '</span><span class="pri-id">' + esc(p.branch_id) + '</span><span style="font-size:12px;color:var(--ink-2)">' + esc(p.label || '') + '</span>';
    list.appendChild(row);
  });
  sec2.appendChild(list);
  const saveP = document.createElement('button'); saveP.className = 'btn btn-primary'; saveP.style.marginTop = '8px'; saveP.textContent = 'Save order';
  saveP.onclick = async () => {
    const items = $$('.pri-row', list).map(r => ({ rank: parseInt(r.querySelector('.pri-rank').textContent.slice(1)), branch_id: r.querySelector('.pri-id').textContent, label: r.lastChild.textContent }));
    try { await api('/brain/priorities', { method: 'POST', body: JSON.stringify(items) }); toast('Priorities saved'); await loadBrain(); } catch (e) { toast('Failed: ' + e.message, true); }
  };
  sec2.appendChild(saveP);
  wrap.appendChild(sec2);
  body.appendChild(wrap);

  let dragIdx = null;
  list.addEventListener('dragstart', (e) => { const r = e.target.closest('.pri-row'); if (!r) return; dragIdx = parseInt(r.dataset.idx); r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
  list.addEventListener('dragend', () => { $$('.pri-row', list).forEach(r => r.classList.remove('dragging', 'drop-above', 'drop-below')); dragIdx = null; });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const r = e.target.closest('.pri-row'); if (!r || dragIdx == null) return;
    const rect = r.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    r.classList.toggle('drop-above', above); r.classList.toggle('drop-below', !above);
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    const r = e.target.closest('.pri-row'); if (!r || dragIdx == null) return;
    const above = r.classList.contains('drop-above');
    const node = list.children[dragIdx];
    list.removeChild(node);
    const target = parseInt(r.dataset.idx);
    const newIdx = above ? target : target + 1;
    list.insertBefore(node, list.children[newIdx] || null);
    $$('.pri-row', list).forEach((row, i) => { row.dataset.idx = String(i); row.querySelector('.pri-rank').textContent = '#' + (i + 1); });
    document.getElementById('pri-count').textContent = list.children.length;
  });
};

// ---------- LOG views ----------
VIEWS['log.journal'] = (body) => {
  const wrap = document.createElement('div');
  wrap.style.maxWidth = '880px';
  const map = {};
  state.learning.forEach(d => { map[d.date] = d; });

  // feature 10: today digest
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = map[today] || { count: 0, topics: '' };
  const todayRecs = state.recs.filter(r => r.status === 'consumed' && (r.consumed_date || '').slice(0, 10) === today);
  const todayVault = state.vault.filter(v => (v.created_at || '').slice(0, 10) === today);
  const digest = document.createElement('div');
  digest.className = 'digest';
  digest.innerHTML =
    '<div class="digest-date">' + esc(fmtDate(today)) + '</div>' +
    '<div class="digest-day">' + esc(new Date(today).toLocaleDateString('en-US', { weekday: 'long' })) + ' \xB7 ' + todayEntry.count + ' log' + (todayEntry.count === 1 ? '' : 's') + '</div>' +
    (todayEntry.topics ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + todayEntry.topics.split(',').filter(x => x.trim()).map(x => '<span class="chip">' + esc(x.trim()) + '</span>').join('') + '</div>' : '<div class="muted" style="font-size:12px">No topics logged today</div>') +
    (todayRecs.length ? '<div class="digest-section"><div class="digest-section-title">Consumed today</div>' + todayRecs.slice(0, 3).map(r => '<div class="digest-item"><span class="dot dot-consumed"></span><a href="' + esc(r.video_url) + '" target="_blank" rel="noopener">' + esc(r.video_title) + '</a></div>').join('') + '</div>' : '') +
    (todayVault.length ? '<div class="digest-section"><div class="digest-section-title">Produced today</div>' + todayVault.slice(0, 3).map(v => '<div class="digest-item"><span class="dot dot-active"></span><a href="/html/download/' + esc(v.id) + '" target="_blank" rel="noopener">' + esc(v.filename) + '</a></div>').join('') + '</div>' : '');
  wrap.appendChild(digest);

  const today2 = new Date();
  const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  let total = 0, activeDays = 0, maxDay = 0, curStreak = 0, bestStreak = 0;
  const dates = [];
  for (let d = new Date(yearAgo); d <= today2; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    const c = (map[key] && map[key].count) || 0;
    total += c; if (c > 0) activeDays++;
    maxDay = Math.max(maxDay, c);
    dates.push({ date: key, count: c });
  }
  for (let i = dates.length - 1; i >= 0; i--) { if (dates[i].count > 0) curStreak++; else break; }
  let run = 0;
  dates.forEach(d => { if (d.count > 0) { run++; bestStreak = Math.max(bestStreak, run); } else run = 0; });

  const stats = document.createElement('div');
  stats.className = 'stat-grid';
  stats.innerHTML =
    '<div class="stat-block"><div class="s-label">Total items</div><div class="s-value c-consumed">' + total + '</div><div class="s-sub">this year</div></div>' +
    '<div class="stat-block"><div class="s-label">Current streak</div><div class="s-value c-active">' + curStreak + '</div><div class="s-sub">days</div></div>' +
    '<div class="stat-block"><div class="s-label">Best streak</div><div class="s-value c-accent">' + bestStreak + '</div><div class="s-sub">days</div></div>' +
    '<div class="stat-block"><div class="s-label">Active days</div><div class="s-value">' + activeDays + '</div><div class="s-sub">of 365</div></div>';
  wrap.appendChild(stats);

  const hmWrap = document.createElement('div');
  hmWrap.className = 'heatmap-wrap';
  const hm = document.createElement('div');
  hm.className = 'heatmap';
  const weeks = [];
  let week = [];
  const startDay = yearAgo.getDay();
  for (let i = 0; i < startDay; i++) week.push(null);
  dates.forEach(d => {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  });
  if (week.length) weeks.push(week);
  weeks.forEach(w => {
    const col = document.createElement('div');
    col.className = 'heatmap-col';
    w.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      if (!day) cell.style.visibility = 'hidden';
      else {
        const c = day.count;
        cell.dataset.count = c;
        if (c > 0) cell.classList.add(c <= 2 ? 'l1' : c <= 5 ? 'l2' : c <= 9 ? 'l3' : 'l4');
        cell.title = day.date + ' \u2014 ' + c + ' item' + (c === 1 ? '' : 's');
        if (c > 0) cell.onclick = () => openDayModal(day.date);
      }
      col.appendChild(cell);
    });
    hm.appendChild(col);
  });
  hmWrap.appendChild(hm);
  wrap.appendChild(hmWrap);

  const t = document.createElement('div');
  t.className = 'sec-title';
  t.innerHTML = 'Recent <span class="count">7d</span>';
  wrap.appendChild(t);
  let hasRecent = false;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const entry = map[key];
    if (!entry || !entry.count) continue;
    hasRecent = true;
    const el = document.createElement('div');
    el.className = 'archive-item';
    const topics = (entry.topics || '').split(',').filter(x => x.trim()).map(x => '<span class="chip">' + esc(x.trim()) + '</span>').join(' ');
    el.innerHTML =
      '<span class="dot dot-consumed" style="margin-top:6px"></span>' +
      '<div><div class="a-title" style="font-size:13px">' + esc(fmtDate(key)) + ' <span class="mono dim">\xD7' + entry.count + '</span></div>' +
      '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">' + (topics || '<span class="dim" style="font-size:12px">no topics</span>') + '</div></div>' +
      '<div></div>';
    wrap.appendChild(el);
  }
  if (!hasRecent) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><div class="e-title">Nothing logged this week</div><div>Log one topic per day to build the streak.</div></div>';
    wrap.appendChild(e);
  }
  body.appendChild(wrap);
};

async function openDayModal(date) {
  try {
    const j = await api('/learning/detail?date=' + date);
    const day = (j.days || []).find(d => d.date === date);
    const c = document.createElement('div');
    c.innerHTML = '<h2 style="margin-bottom:12px">' + esc(fmtDate(date)) + '</h2>' +
      '<div class="muted" style="margin-bottom:12px">' + (day ? day.count : 0) + ' item' + (day && day.count > 1 ? 's' : '') + '</div>' +
      (day && day.topics ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + day.topics.split(',').filter(x => x.trim()).map(x => '<span class="chip">' + esc(x.trim()) + '</span>').join('') + '</div>' : '<div class="dim">No topics recorded.</div>');
    openModal(c);
  } catch { toast('Failed to load day', true); }
}

VIEWS['log.vault'] = (body) => {
  const q = state.search.toLowerCase();
  let files = state.vault;
  if (q) files = files.filter(f => f.filename.toLowerCase().includes(q));
  if (!files.length) {
    body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><div class="e-title">Vault is empty</div><div>Upload HTML artifacts or PDFs \u2014 they will show up here, paired by name.</div><button class="btn btn-primary" onclick="window.__up()">Upload file</button></div>';
    window.__up = openUploadSheet;
    return;
  }
  const groups = {};
  files.forEach(f => {
    const base = f.filename.replace(/.(html?|pdf)$/i, '');
    const ext = (f.filename.match(/.(w+)$/i) || [])[1]?.toLowerCase();
    (groups[base] = groups[base] || {});
    if (ext === 'html' || ext === 'htm') { if (!groups[base].html || f.created_at > groups[base].html.created_at) groups[base].html = f; }
    else if (ext === 'pdf') { if (!groups[base].pdf || f.created_at > groups[base].pdf.created_at) groups[base].pdf = f; }
    else (groups[base].other = groups[base].other || []).push(f);
  });
  const list = document.createElement('div');
  list.className = 'vault-list';
  Object.entries(groups).forEach(([base, g]) => {
    const row = document.createElement('div');
    row.className = 'vault-row';
    const parts = [];
    if (g.html) parts.push('HTML ' + fmtDate(g.html.created_at));
    if (g.pdf) parts.push('PDF ' + fmtDate(g.pdf.created_at));
    row.innerHTML =
      '<div><div class="vault-name">' + esc(base) + '</div>' +
      '<div class="vault-meta">' + esc(parts.join(' \xB7 ') || fmtDate((g.other && g.other[0] || {}).created_at)) + '</div></div>';
    const acts = document.createElement('div');
    acts.className = 'vault-actions';
    let firstFile = null;
    if (g.html) {
      const view = document.createElement('a');
      view.className = 'btn btn-sm'; view.textContent = 'Open';
      view.href = '/html/download/' + g.html.id; view.target = '_blank'; view.rel = 'noopener';
      acts.appendChild(view);
      firstFile = g.html;
      const print = document.createElement('a');
      print.className = 'btn btn-sm btn-ghost'; print.textContent = 'Print';
      print.href = '/html/print/' + g.html.id; print.target = '_blank'; print.rel = 'noopener';
      acts.appendChild(print);
    }
    if (g.pdf) {
      const pdf = document.createElement('a');
      pdf.className = 'btn btn-sm btn-ghost'; pdf.textContent = 'PDF';
      pdf.href = '/html/download/' + g.pdf.id; pdf.target = '_blank'; pdf.rel = 'noopener';
      acts.appendChild(pdf);
      if (!firstFile) firstFile = g.pdf;
    }
    const del = document.createElement('button');
    del.className = 'btn btn-sm btn-ghost btn-danger';
    del.textContent = 'Delete';
    del.onclick = async () => {
      const target = g.html || g.pdf || (g.other && g.other[0]);
      if (!target) return;
      if (!confirm('Delete ' + target.filename + '?')) return;
      try {
        await api('/html/delete', { method: 'POST', body: JSON.stringify({ id: target.id }) });
        toast('Deleted');
        await loadVault(); renderSubnav(); renderBody();
      } catch (e) { toast('Delete failed: ' + e.message, true); }
    };
    acts.appendChild(del);
    row.appendChild(acts);
    if (firstFile) row.dataset.fid = firstFile.id;
    list.appendChild(row);
  });
  body.appendChild(list);

  // feature 11: inline preview
  let openId = null, blobUrl = null;
  body.onclick = async (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    const row = e.target.closest('.vault-row'); if (!row) return;
    const fileId = row.dataset.fid;
    if (!fileId) return;
    const existing = body.querySelector('.vault-preview'); if (existing) { existing.remove(); if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null; openId = null; body.querySelectorAll('.vault-row.expanded').forEach(r => r.classList.remove('expanded')); }
    if (openId === fileId) return;
    openId = fileId;
    row.classList.add('expanded');
    const preview = document.createElement('div');
    preview.className = 'vault-preview';
    const inner = document.createElement('div');
    inner.className = 'vault-preview-inner';
    inner.innerHTML = '<div class="vault-preview-bar"><span>Preview</span><a href="/html/download/' + esc(fileId) + '" target="_blank" rel="noopener">Open in new tab \u2197</a></div>';
    preview.appendChild(inner);
    row.insertAdjacentElement('afterend', preview);
    try {
      const r = await fetch('/html/download/' + fileId);
      const blob = await r.blob();
      blobUrl = URL.createObjectURL(blob);
      if (blob.type === 'application/pdf') {
        const link = document.createElement('a');
        link.href = blobUrl; link.target = '_blank'; link.rel = 'noopener';
        link.textContent = 'Open PDF'; link.className = 'btn btn-sm';
        link.style.cssText = 'margin:14px;display:inline-block';
        inner.appendChild(link);
      } else {
        const iframe = document.createElement('iframe');
        iframe.src = blobUrl; iframe.sandbox = 'allow-same-origin';
        inner.appendChild(iframe);
      }
    } catch (e2) { inner.innerHTML += '<div class="muted" style="padding:14px;font-size:12px">Preview failed.</div>'; }
  };
};

VIEWS['log.stats'] = (body) => {
  const S = state.stats;
  if (!S) {
    body.innerHTML = '<div class="empty">No stats yet.</div>';
    return;
  }
  const total = S.total || 0;
  const active = (S.byStatus && S.byStatus.active) || 0;
  const consumed = (S.byStatus && S.byStatus.consumed) || 0;
  const rejected = (S.byStatus && S.byStatus.rejected) || 0;
  const rate = total > 0 ? Math.round(consumed / total * 100) : 0;
  const wrap = document.createElement('div');
  wrap.style.maxWidth = '980px';

  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML =
    '<div class="stat-block"><div class="s-label">Total</div><div class="s-value">' + total + '</div><div class="s-sub">all entries</div></div>' +
    '<div class="stat-block"><div class="s-label">Queue</div><div class="s-value c-active">' + active + '</div><div class="s-sub">waiting</div></div>' +
    '<div class="stat-block"><div class="s-label">Consumed</div><div class="s-value c-consumed">' + consumed + '</div><div class="s-sub">' + rate + '% of total</div></div>' +
    '<div class="stat-block"><div class="s-label">Rejected</div><div class="s-value c-rejected">' + rejected + '</div><div class="s-sub">' + Math.round(rejected / Math.max(1, total) * 100) + '%</div></div>';
  wrap.appendChild(grid);

  if (S.topCreators && S.topCreators.length) {
    const t = document.createElement('div');
    t.className = 'sec-title';
    t.innerHTML = 'Top creators <span class="count">' + S.topCreators.length + '</span>';
    wrap.appendChild(t);
    const max = Math.max(...S.topCreators.map(c => c.c), 1);
    S.topCreators.slice(0, 10).forEach(cr => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<span class="b-label">' + esc(cr.creator) + '</span>' +
        '<div class="b-track"><div class="b-fill" style="width:' + Math.round(cr.c / max * 100) + '%"></div></div>' +
        '<span class="b-count">' + cr.c + '</span>';
      wrap.appendChild(row);
    });
  }

  if (S.consumptionByMonth && S.consumptionByMonth.length) {
    const t = document.createElement('div');
    t.className = 'sec-title';
    t.innerHTML = 'Consumption by month';
    wrap.appendChild(t);
    const max = Math.max(...S.consumptionByMonth.map(m => m.c), 1);
    S.consumptionByMonth.forEach(m => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<span class="b-label mono">' + esc(m.m) + '</span>' +
        '<div class="b-track"><div class="b-fill c-consumed" style="width:' + Math.round(m.c / max * 100) + '%"></div></div>' +
        '<span class="b-count">' + m.c + '</span>';
      wrap.appendChild(row);
    });
  }

  if (S.bundles && S.bundles.length) {
    const t = document.createElement('div');
    t.className = 'sec-title';
    t.innerHTML = 'Synergy bundles <span class="count">' + S.bundles.length + '</span>';
    wrap.appendChild(t);
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    S.bundles.forEach(b => {
      const c = document.createElement('span');
      c.className = 'chip chip-accent';
      c.textContent = b.synergy_bundle_id + ' \xD7' + b.c;
      chips.appendChild(c);
    });
    wrap.appendChild(chips);
  }

  const exp = document.createElement('div');
  exp.style.cssText = 'margin-top:24px;display:flex;gap:8px';
  exp.innerHTML = '<a class="btn" href="/recommendations/export">Export JSON</a><a class="btn" href="/recommendations/export?format=md">Export Markdown</a>';
  wrap.appendChild(exp);

  body.appendChild(wrap);
};

// ---------- batch bar wiring (feature 3) ----------
document.getElementById('batch-consumed').onclick = async () => { await batchAct('consumed'); };
document.getElementById('batch-reject').onclick = async () => { await batchAct('rejected'); };
document.getElementById('batch-clear').onclick = () => { state.selection.clear(); updateBatchBar(); document.querySelectorAll('.chk').forEach(c => c.checked = false); };
async function batchAct(status) {
  if (!state.selection.size) return;
  const ids = [...state.selection];
  try {
    setLoading(document.getElementById('batch-' + status), true);
    await api('/recommendations/action', { method: 'POST', body: JSON.stringify({ ids, status }) });
    state.selection.clear();
    updateBatchBar();
    await loadRecs(); await loadBrain();
    renderSubnav(); renderBody();
    const label = status === 'consumed' ? 'Consumed' : 'Rejected';
    toastUndo(label + ' ' + ids.length + ' items', async () => {
      try {
        // Revert: restore original status (best-effort)
        for (const id of ids) {
          const orig = state.recs.find(r => r.id === id);
          if (orig) await api('/recommendations/action', { method: 'POST', body: JSON.stringify({ id, status: 'active' }) });
        }
        toast('Undone');
        await loadRecs(); await loadBrain(); renderSubnav(); renderBody();
      } catch (e) { toast('Undo failed: ' + e.message, true); }
    });
  } catch (e) { toast('Failed: ' + e.message, true); }
  finally { setLoading(document.getElementById('batch-' + status), false); }
}

// ---------- FAB (feature 9) ----------
const fab = document.getElementById('fab-new');
if (fab) fab.onclick = openPushSheet;

// ---------- theme ----------
$('#theme-btn').onclick = () => {
  const cur = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = cur;
  localStorage.setItem('tm-theme', cur);
};
const savedTheme = localStorage.getItem('tm-theme');
if (savedTheme) document.body.dataset.theme = savedTheme;

// ---------- global key handler (feature 4) ----------
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const inField = tag === 'input' || tag === 'textarea' || tag === 'select';
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (inField) return;
  if (e.key === 'Escape') { state.keySeq = null; return; }
  if (e.key === '?') { e.preventDefault(); openKeymap(); return; }
  if (state.keySeq === 'g') {
    state.keySeq = null;
    if (e.key === 'c') return setWorkspace('curate');
    if (e.key === 'm') return setWorkspace('map');
    if (e.key === 'l') return setWorkspace('log');
  }
  if (e.key === 'g' && !state.keySeq) { state.keySeq = 'g'; return; }
  if (/^[1-9]$/.test(e.key)) {
    const views = WS[state.ws].views;
    const i = parseInt(e.key) - 1;
    if (views[i]) { e.preventDefault(); setWorkspace(state.ws, views[i][0]); return; }
  }
  if (e.key === 'n') { e.preventDefault(); openPushSheet(); return; }
  if (e.key === '/') {
    e.preventDefault();
    const inp = document.querySelector('.ws-subnav input.input');
    if (inp) inp.focus();
    return;
  }
  const cards = $$('.queue-card, .archive-item, .branch-card, .vault-row');
  if (e.key === 'j') { e.preventDefault(); state.focusedRow = Math.min(cards.length - 1, state.focusedRow + 1); cards.forEach((c, i) => c.style.outline = i === state.focusedRow ? '2px solid var(--accent)' : ''); }
  else if (e.key === 'k') { e.preventDefault(); state.focusedRow = Math.max(0, state.focusedRow - 1); cards.forEach((c, i) => c.style.outline = i === state.focusedRow ? '2px solid var(--accent)' : ''); }
  else if (e.key === 'c' || e.key === 'x') {
    const r = getFocusedRow();
    if (r && r.dataset.fid) {
      const rec = state.recs.find(x => x.id === r.dataset.fid);
      if (rec) openReviewSheet(rec, e.key === 'c' ? 'consumed' : 'rejected');
    }
  } else if (e.key === 'r' || e.key === 'e') {
    const r = getFocusedRow();
    if (r && r.dataset.fid) {
      const rec = state.recs.find(x => x.id === r.dataset.fid);
      if (rec) openReviewSheet(rec, rec.status);
    }
  }
});

// ---------- boot ----------
async function refresh(showMsg) {
  const ws = state.ws, sub = state.sub[state.ws];
  const loaders = { recs: loadRecs, brain: loadBrain, learning: loadLearning, vault: loadVault, stats: loadStats };
  const needs = {
    curate: ['recs', 'brain'], map: ['brain', 'recs'], log: ['learning', 'vault', 'stats', 'recs'],
  }[ws] || [];
  await Promise.all(needs.map(k => loaders[k]()));
  renderSubnav(); renderBody();
  if (showMsg) toast('Refreshed');
}

const hash = location.hash.replace(/^#./, '');
const [hw, hs] = hash.split('/');
if (WS[hw]) { state.ws = hw; if (hs && WS[hw].views.some(v => v[0] === hs)) state.sub[hw] = hs; }

$$('.nav-btn[data-ws]').forEach(b => {
  b.onclick = () => setWorkspace(b.dataset.ws);
});

loadRecs().then(() => { if (state.ws === 'curate') { renderSubnav(); renderBody(); } });
loadBrain().then(() => { if (state.ws === 'map') { renderSubnav(); renderBody(); } });
loadLearning().then(() => { if (state.ws === 'log' && state.sub.log === 'journal') renderBody(); });
loadVault().then(() => { if (state.ws === 'log' && state.sub.log === 'vault') { renderSubnav(); renderBody(); } });
loadStats().then(() => { if (state.ws === 'log' && state.sub.log === 'stats') renderBody(); });

setWorkspace(state.ws, state.sub[state.ws]);
`;

// src/index.ts
var app7 = new Hono2();
app7.use("/*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));
app7.use("/*", async (c, next) => {
  await next();
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    const path = new URL(c.req.url).pathname;
    const skip = path === "/html/list" || path === "/stats" || path === "/recommendations/list" || path.startsWith("/static/");
    const already = c.res.headers.get("Cache-Control");
    if (!skip && !already) {
      c.res.headers.set("Cache-Control", "public, max-age=60, s-maxage=300");
    }
  }
});
app7.get("/health", (c) => c.json({ ok: true, now: (/* @__PURE__ */ new Date()).toISOString() }));
app7.use("/*", async (c, next) => {
  const cl = c.req.header("content-length");
  if (cl && Number(cl) > 10 * 1024 * 1024) {
    return c.json({ error: "Payload too large" }, 413);
  }
  await next();
});
app7.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") return next();
  const token = c.req.header("x-api-token") || c.req.query("token");
  const expected = c.env.API_TOKEN;
  if (expected && token !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});
app7.route("/recommendations", recommendations_default);
app7.route("/brain", brain_default);
app7.route("/html", vault_default);
app7.route("/learning", learning_default);
app7.route("/stats", stats_default);
app7.route("/search", search_default);
app7.get("/", (c) => c.html(htmlShell));
app7.get("/ui", (c) => c.html(htmlShell));
app7.get("/static/app.css", (c) => {
  c.header("Content-Type", "text/css; charset=utf-8");
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(cssBundle);
});
app7.get("/static/app.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(jsBundle);
});
var index_default = app7;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
