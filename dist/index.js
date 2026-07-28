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
  route(path, app9) {
    const subApp = this.basePath(path);
    app9.routes.map((r) => {
      let handler;
      if (app9.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app9.errorHandler)(c, () => r.handler(c, next))).res, "handler");
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
var VALID_LOG_KINDS = /* @__PURE__ */ new Set(["feedback", "tree_change", "pattern", "note", "system"]);
function normalizeRating(raw2) {
  if (raw2 == null) return { rating: "unset", score: null };
  const s = String(raw2).trim();
  if (s === "" || s === "unset") return { rating: "unset", score: null };
  if (VALID_RATINGS.has(s)) {
    const map = { unset: null, love: 10, like: 8, meh: 5, dislike: 2 };
    return { rating: s, score: map[s] ?? null };
  }
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) {
    let n = parseFloat(m[1]);
    if (!isNaN(n)) {
      n = Math.max(0, Math.min(10, n));
      const rating = n >= 8 ? "love" : n >= 6 ? "like" : n >= 4 ? "meh" : "dislike";
      return { rating, score: n };
    }
  }
  return { rating: "unset", score: null };
}
__name(normalizeRating, "normalizeRating");
function deriveDedupKey(item) {
  if (item.dedup_key && item.dedup_key.trim()) return item.dedup_key.trim();
  const url = item.video_url || "";
  const yt = url.match(/(?:youtu\.be\/|v=)([\w-]{6,})/) || url.match(/youtube\.com\/embed\/([\w-]+)/);
  if (yt) return "yt_" + yt[1];
  const amz = url.match(/amazon\.[a-z.]+\/(?:dp|gp\/product|product)\/([A-Z0-9]{8,})/i);
  if (amz) return "book_" + amz[1];
  const isbn = url.match(/isbn[:=]?(\d{10,13})/i) || (item.video_title || "").match(/(\d{10,13})/);
  if (isbn) return "book_" + isbn[1];
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/\./g, "_");
    const slug = (u.pathname.replace(/\/$/, "").split("/").pop() || "x").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    const type = (item.content_type || "art").slice(0, 4);
    return `${type}_${host}_${slug}`.toLowerCase();
  } catch {
    const slug = (item.video_title || "x").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    return "key_" + slug;
  }
}
__name(deriveDedupKey, "deriveDedupKey");
var isValidUrl = /* @__PURE__ */ __name((u) => typeof u === "string" && u.length > 0 && u.length < 2048 && /^https?:\/\/[^\s<>"']+$/i.test(u), "isValidUrl");
var isNonEmptyStr = /* @__PURE__ */ __name((v, max = 5e3) => typeof v === "string" && v.length > 0 && v.length <= max, "isNonEmptyStr");
var isValidLength = /* @__PURE__ */ __name((v, min, max) => typeof v === "string" && v.length >= min && v.length <= max, "isValidLength");
var escapeHtml = /* @__PURE__ */ __name((s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "escapeHtml");
var safeError = /* @__PURE__ */ __name((fallback) => (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[err]", msg);
  return { error: fallback };
}, "safeError");
function normalizeYouTubeUrl(url) {
  const match2 = url.match(/(?:youtu\.be\/|(?:v|embed|shorts)\/|watch\?v=)([\w-]{11})/);
  if (match2) return `https://www.youtube.com/watch?v=${match2[1]}`;
  return url;
}
__name(normalizeYouTubeUrl, "normalizeYouTubeUrl");
function normalizeUrlForDedup(url) {
  let u = url.trim().replace(/\/$/, "");
  u = u.replace(/[?&](utm_[^=]+=[^&]*|fbclid=[^&]*|ref=[^&]*|feature=[^&]*|si=[^&]*|t=[^&]*)(&|$)/g, "$2");
  u = u.replace(/[?&]$/, "");
  u = normalizeYouTubeUrl(u);
  return u;
}
__name(normalizeUrlForDedup, "normalizeUrlForDedup");

// src/api/recommendations.ts
var app = new Hono2();
app.get("/active", async (c) => {
  const { DB } = c.env;
  c.header("Cache-Control", "no-store");
  try {
    const res = await DB.prepare(
      `SELECT * FROM recommendations WHERE status = 'active' ORDER BY created_at DESC`
    ).all();
    return c.json({ recommendations: res.results || [] });
  } catch (err) {
    return c.json(safeError("Active failed")(err), 500);
  }
});
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
      const norm = normalizeRating(item.user_rating);
      if (item.user_rating != null && item.user_rating !== "" && norm.rating === "unset") continue;
      const id = item.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const cleanUrl = normalizeUrlForDedup(item.video_url);
      const dedupItem = { ...item, video_url: cleanUrl };
      const dedupKey = deriveDedupKey(dedupItem);
      stmts.push(
        DB.prepare(
          `INSERT INTO recommendations (
            id, video_title, creator, content_type, video_url, why_this, verified, status,
            user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(dedup_key) DO UPDATE SET
            video_title = excluded.video_title,
            creator = excluded.creator,
            content_type = excluded.content_type,
            video_url = excluded.video_url,
            why_this = excluded.why_this,
            verified = excluded.verified,
            status = excluded.status,
            user_rating = excluded.user_rating,
            user_score = excluded.user_score,
            user_review = excluded.user_review,
            synergy_bundle_id = excluded.synergy_bundle_id,
            consumed_date = excluded.consumed_date`
        ).bind(
          id,
          item.video_title,
          item.creator || null,
          item.content_type || null,
          cleanUrl,
          item.why_this || null,
          item.verified || today,
          item.status || "active",
          norm.rating,
          norm.score,
          item.user_review || null,
          dedupKey,
          item.synergy_bundle_id || null,
          item.consumed_date || null
        )
      );
    }
    if (stmts.length === 0) return c.json({ ok: true, count: 0 });
    await DB.batch(stmts);
  } catch (err) {
    return c.json(safeError("Push failed")(err), 500);
  }
  return c.json({ ok: true, count: stmts.length });
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
  const norm = normalizeRating(body.user_rating);
  if (body.user_rating != null && String(body.user_rating) !== "" && norm.rating === "unset") {
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
  if (body.status === "consumed") {
    const review = (body.user_review || "").trim();
    const currentStatus = ids.length === 1 ? await DB.prepare("SELECT status FROM recommendations WHERE id = ?").bind(ids[0]).first() : null;
    const wasConsumed = currentStatus && currentStatus.status === "consumed";
    if (!wasConsumed && review.length < 3) {
      return c.json({ error: "A review is required to mark consumed (min 3 chars)." }, 400);
    }
  }
  const consumedDate = body.status === "consumed" ? body.consumed_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0] : null;
  try {
    const stmts = ids.map((id) => DB.prepare(
      `UPDATE recommendations
       SET status = ?,
           user_rating = COALESCE(?, user_rating),
           user_score = COALESCE(?, user_score),
           user_review = COALESCE(?, user_review),
           consumed_date = COALESCE(?, consumed_date)
       WHERE id = ?`
    ).bind(
      body.status,
      norm.rating === "unset" ? null : norm.rating,
      norm.score,
      body.user_review || null,
      consumedDate,
      id
    ));
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
    if (body.status === "consumed") {
      for (const id of ids) {
        try {
          await scheduleResurfacing(DB, id);
        } catch (e) {
          console.warn("resurface sched failed", e);
        }
        try {
          await detectContradiction(DB, id);
        } catch (e) {
          console.warn("contradiction detect failed", e);
        }
      }
    }
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
  if (!body.id) return c.json({ error: "id required" }, 400);
  if (!isNonEmptyStr(body.id, 100)) return c.json({ error: "id required" }, 400);
  try {
    if (body.undo) {
      const row = await DB.prepare("SELECT * FROM recommendations WHERE id = ?").bind(body.id).first();
      if (!row) return c.json({ error: "not found" }, 404);
      await DB.batch([
        DB.prepare("INSERT OR REPLACE INTO undo_queue (id, table_name, row_id, snapshot_json, expires_at) VALUES (?, 'recommendations', ?, ?, datetime('now', '+30 seconds'))").bind(body.id, body.id, JSON.stringify(row)),
        DB.prepare("DELETE FROM recommendations WHERE id = ?").bind(body.id)
      ]);
    } else {
      await DB.prepare("DELETE FROM recommendations WHERE id = ?").bind(body.id).run();
    }
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Delete failed")(err), 500);
  }
});
app.post("/undo", async (c) => {
  const { DB } = c.env;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!body.id) return c.json({ error: "id required" }, 400);
  try {
    const row = await DB.prepare("SELECT * FROM undo_queue WHERE id = ? AND expires_at > datetime('now')").bind(body.id).first();
    if (!row) return c.json({ error: "nothing to undo or expired" }, 404);
    if (row.table_name === "recommendations") {
      const snap = JSON.parse(row.snapshot_json);
      await DB.prepare(`INSERT OR REPLACE INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(snap.id, snap.video_title, snap.creator, snap.content_type, snap.video_url, snap.why_this, snap.verified, snap.status, snap.user_rating, snap.user_score, snap.user_review, snap.dedup_key, snap.synergy_bundle_id, snap.consumed_date).run();
    }
    await DB.prepare("DELETE FROM undo_queue WHERE id = ?").bind(body.id).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Undo failed")(err), 500);
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
async function scheduleResurfacing(DB, recId) {
  const existing = await DB.prepare("SELECT id FROM resurfacing WHERE recommendation_id = ? AND resolved_at IS NULL LIMIT 1").bind(recId).first();
  if (existing) return;
  const stages = ["30d", "90d", "180d"];
  const offsets = [30, 90, 180];
  const stmts = stages.map(
    (stage, i) => DB.prepare(
      `INSERT INTO resurfacing (recommendation_id, stage, due_at, notes)
       VALUES (?, ?, date('now', '+' || ? || ' days'), ?)`
    ).bind(recId, stage, offsets[i], "auto-scheduled on consume")
  );
  await DB.batch(stmts);
}
__name(scheduleResurfacing, "scheduleResurfacing");
async function detectContradiction(DB, recId) {
  const me = await DB.prepare("SELECT id, dedup_key, user_rating, user_review, video_title FROM recommendations WHERE id = ?").bind(recId).first();
  if (!me || !me.dedup_key) return;
  const myBranch = me.dedup_key.split("-")[0];
  if (!myBranch || myBranch === "yt" || myBranch === "book" || myBranch === "key") return;
  const opposite = me.user_rating === "love" || me.user_rating === "like" ? ["meh", "dislike"] : me.user_rating === "dislike" || me.user_rating === "meh" ? ["love", "like"] : [];
  if (!opposite.length) return;
  const others = await DB.prepare(
    `SELECT id, dedup_key, user_rating, video_title
     FROM recommendations
     WHERE status = 'consumed' AND id != ? AND user_rating IN ('love','like','meh','dislike')
       AND substr(dedup_key, 1, instr(dedup_key || '-', '-') - 1) = ?`
  ).bind(recId, myBranch).all();
  for (const o of others.results || []) {
    if (!opposite.includes(o.user_rating)) continue;
    const tid = [me.id, o.id].sort().join("::");
    const exists = await DB.prepare("SELECT id FROM contradictions WHERE id = ?").bind(tid).first();
    if (exists) continue;
    await DB.prepare(
      `INSERT OR IGNORE INTO contradictions (id, source_a, source_b, topic, tension, detected_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      tid,
      me.id,
      o.id,
      myBranch,
      `Consumed "${me.video_title}" as ${me.user_rating} but "${o.video_title}" as ${o.user_rating} under branch ${myBranch}.`
    ).run();
  }
}
__name(detectContradiction, "detectContradiction");
app.get("/export", async (c) => {
  const { DB } = c.env;
  const format = c.req.query("format") || "json";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "500"), 1), 5e3);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);
  try {
    const result = await DB.prepare("SELECT * FROM recommendations ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(limit, offset).all();
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
    return c.json({ exported_at: (/* @__PURE__ */ new Date()).toISOString(), total: items.length, limit, offset, recommendations: items });
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
  const recentLimit = Math.min(Math.max(parseInt(c.req.query("recent_limit") || "10"), 1), 50);
  try {
    const profile = await DB.prepare("SELECT * FROM profile WHERE id = 1").first();
    const priorities = await DB.prepare("SELECT * FROM priorities ORDER BY rank ASC").all();
    const mastered = await DB.prepare("SELECT * FROM mastered ORDER BY mastered_at DESC").all();
    const blacklist = await DB.prepare("SELECT * FROM blacklist ORDER BY severity ASC, added_at DESC").all();
    const patterns = await DB.prepare("SELECT * FROM patterns ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, confirmed_date DESC").all();
    const recent = await DB.prepare("SELECT * FROM update_log ORDER BY id DESC LIMIT ?").bind(recentLimit).all();
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
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 500);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);
  try {
    const result = await DB.prepare("SELECT id, type, label, status, super_category, parent_id, meta_json FROM tree_nodes ORDER BY id LIMIT ? OFFSET ?").bind(limit, offset).all();
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
    return c.json({ nodes, count: nodes.length, limit, offset });
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
    if (!summary || !isValidLength(summary, 1, 500)) return c.json({ error: "summary required (1-500 chars)" }, 400);
    if (kind && !VALID_LOG_KINDS.has(kind)) return c.json({ error: "invalid kind" }, 400);
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
      if (p.identity && !isValidLength(p.identity, 0, 5e3)) return c.json({ error: "identity too long" }, 400);
      if (p.core_filter && !isValidLength(p.core_filter, 0, 5e3)) return c.json({ error: "core_filter too long" }, 400);
      if (p.reaction_style && !isValidLength(p.reaction_style, 0, 5e3)) return c.json({ error: "reaction_style too long" }, 400);
      if (p.quality_rules && !isValidLength(p.quality_rules, 0, 5e3)) return c.json({ error: "quality_rules too long" }, 400);
      if (p.operational_style && !isValidLength(p.operational_style, 0, 5e3)) return c.json({ error: "operational_style too long" }, 400);
      if (p.patterns_summary && !isValidLength(p.patterns_summary, 0, 5e3)) return c.json({ error: "patterns_summary too long" }, 400);
      if (p.recent_signal && !isValidLength(p.recent_signal, 0, 5e3)) return c.json({ error: "recent_signal too long" }, 400);
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
      for (const [rank, branch_id, label, rationale] of body.priorities) {
        if (typeof rank !== "number") continue;
        if (!isNonEmptyStr(branch_id, 100)) continue;
        if (rationale && !isValidLength(rationale, 0, 500)) return c.json({ error: "rationale too long (max 500 chars)" }, 400);
        stmts.push(DB.prepare("INSERT OR REPLACE INTO priorities (rank, branch_id, label, rationale) VALUES (?, ?, ?, ?)").bind(rank, branch_id, label || null, rationale || null));
      }
    }
    if (Array.isArray(body.tree_nodes)) {
      for (const n of body.tree_nodes) {
        if (!isNonEmptyStr(n.id, 100)) continue;
        if (!isNonEmptyStr(n.label, 200)) return c.json({ error: `label too long for node ${n.id}` }, 400);
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
        if (!isNonEmptyStr(m[0], 100)) continue;
        if (m[5] && !isValidLength(m[5], 0, 1e3)) return c.json({ error: `notes too long for mastered ${m[0]}` }, 400);
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO mastered (id, kind, label, author, rating, notes, mastered_at, decay_review_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT mastered_at FROM mastered WHERE id = ?), datetime('now')), COALESCE((SELECT decay_review_at FROM mastered WHERE id = ?), datetime('now', '+12 months')))
        `).bind(m[0], m[1], m[2], m[3] || null, m[4] || null, m[5] || null, m[0], m[0]));
      }
    }
    if (Array.isArray(body.blacklist)) {
      for (const b of body.blacklist) {
        if (!isNonEmptyStr(b[0], 100)) continue;
        if (!isNonEmptyStr(b[1], 200)) return c.json({ error: `name too long for blacklist ${b[0]}` }, 400);
        if (b[3] && !isValidLength(b[3], 0, 1e3)) return c.json({ error: `reason too long for blacklist ${b[0]}` }, 400);
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO blacklist (id, name, work, reason, severity)
          VALUES (?, ?, ?, ?, ?)
        `).bind(b[0], b[1], b[2] || null, b[3] || null, b[4] || 3));
      }
    }
    if (Array.isArray(body.patterns_confirmed)) {
      for (const p of body.patterns_confirmed) {
        if (!isNonEmptyStr(p[0], 100)) continue;
        if (!isNonEmptyStr(p[1], 500)) return c.json({ error: `description too long for pattern ${p[0]}` }, 400);
        if (p[2] && !Array.isArray(p[2])) return c.json({ error: `evidence_json must be an array for pattern ${p[0]}` }, 400);
        if (p[5] && !isValidLength(p[5], 0, 1e3)) return c.json({ error: `notes too long for pattern ${p[0]}` }, 400);
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO patterns (id, description, evidence_json, confirmed_date, strength, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(p[0], p[1], JSON.stringify(p[2] || []), p[3] || null, p[4] || "confirmed", p[5] || null));
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
      if (p.rationale && !isValidLength(p.rationale, 0, 500)) return c.json({ error: "rationale too long (max 500 chars)" }, 400);
      stmts.push(DB.prepare("INSERT INTO priorities (rank, branch_id, label, rationale) VALUES (?, ?, ?, ?)").bind(p.rank, p.branch_id, p.label || null, p.rationale || null));
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
    const result = await DB.prepare("SELECT id, filename, created_at, length(content) as size, substr(content, 1, 200) as snippet FROM html_files ORDER BY created_at DESC").all();
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
        "Content-Disposition": `${isPdf ? "inline" : "inline"}; filename="${encodeURIComponent(file.filename)}"`,
        "X-Frame-Options": "ALLOWALL",
        "Access-Control-Allow-Origin": "*"
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
    const { id, undo } = await c.req.json();
    if (!id) return c.json({ error: "ID required" }, 400);
    if (!isNonEmptyStr(id, 100)) return c.json({ error: "ID required" }, 400);
    if (undo) {
      const row = await DB.prepare("SELECT * FROM html_files WHERE id = ?").bind(id).first();
      if (!row) return c.json({ error: "not found" }, 404);
      await DB.batch([
        DB.prepare("INSERT OR REPLACE INTO undo_queue (id, table_name, row_id, snapshot_json, expires_at) VALUES (?, 'html_files', ?, ?, datetime('now', '+30 seconds'))").bind(id, id, JSON.stringify(row)),
        DB.prepare("DELETE FROM html_files WHERE id = ?").bind(id)
      ]);
    } else {
      await DB.prepare("DELETE FROM html_files WHERE id = ?").bind(id).run();
    }
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Delete failed")(err), 500);
  }
});
app3.post("/undo", async (c) => {
  const { DB } = c.env;
  try {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "ID required" }, 400);
    const row = await DB.prepare("SELECT * FROM undo_queue WHERE id = ? AND expires_at > datetime('now')").bind(id).first();
    if (!row) return c.json({ error: "nothing to undo or expired" }, 404);
    if (row.table_name === "html_files") {
      const snap = JSON.parse(row.snapshot_json);
      await DB.prepare("INSERT OR REPLACE INTO html_files (id, filename, content) VALUES (?, ?, ?)").bind(snap.id, snap.filename, snap.content).run();
    }
    await DB.prepare("DELETE FROM undo_queue WHERE id = ?").bind(id).run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(safeError("Undo failed")(err), 500);
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
      headers: { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "ALLOWALL" }
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
app4.get("/update-log", async (c) => {
  const { DB } = c.env;
  const limit = Math.min(parseInt(c.req.query("limit") || "30"), 100);
  try {
    const result = await DB.prepare(
      "SELECT id, ts, kind, summary, details_json FROM update_log ORDER BY ts DESC LIMIT ?"
    ).bind(limit).all();
    return c.json({ events: result.results || [] });
  } catch (err) {
    return c.json(safeError("Update log failed")(err), 500);
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
  const allLimit = Math.min(Math.max(parseInt(c.req.query("all_limit") || "100"), 1), 1e3);
  const allOffset = Math.max(parseInt(c.req.query("all_offset") || "0"), 0);
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
      htmlVault,
      streakConsecutive,
      streakMax,
      weekLast,
      weekThis,
      ratingByCreator
    ] = await Promise.all([
      DB.prepare("SELECT COUNT(*) as c FROM recommendations").first(),
      DB.prepare("SELECT status, COUNT(*) as c FROM recommendations GROUP BY status").all(),
      DB.prepare("SELECT user_rating, COUNT(*) as c FROM recommendations WHERE status='consumed' AND user_rating != 'unset' AND user_rating != '' GROUP BY user_rating ORDER BY c DESC").all(),
      DB.prepare("SELECT substr(consumed_date,1,7) as m, COUNT(*) as c FROM recommendations WHERE status='consumed' AND consumed_date != 'unset' GROUP BY m ORDER BY m ASC").all(),
      DB.prepare("SELECT creator, COUNT(*) as c FROM recommendations WHERE creator IS NOT NULL AND creator != '' GROUP BY creator ORDER BY c DESC LIMIT 15").all(),
      DB.prepare("SELECT video_title, creator, user_rating, user_review, consumed_date FROM recommendations WHERE status='consumed' ORDER BY consumed_date DESC LIMIT 25").all(),
      DB.prepare("SELECT video_title, creator, why_this, created_at FROM recommendations WHERE status='active' ORDER BY created_at DESC LIMIT 25").all(),
      DB.prepare("SELECT synergy_bundle_id, COUNT(*) as c FROM recommendations WHERE synergy_bundle_id != 'unset' GROUP BY synergy_bundle_id ORDER BY c DESC").all(),
      DB.prepare("SELECT video_title, creator, status, user_rating, user_review, why_this, synergy_bundle_id, content_type, created_at FROM recommendations ORDER BY created_at ASC LIMIT ? OFFSET ?").bind(allLimit, allOffset).all(),
      DB.prepare("SELECT id, filename, created_at, length(content) as size FROM html_files ORDER BY created_at DESC").all(),
      DB.prepare(`
        WITH RECURSIVE dates(d) AS (
          SELECT date('now') UNION ALL SELECT date(d, '-1 day') FROM dates WHERE d > date('now', '-365 days')
        )
        SELECT COUNT(*) as streak FROM dates d
        WHERE EXISTS (SELECT 1 FROM learning_log WHERE date = d.d)
          AND d.d >= COALESCE((SELECT date(MAX(date), '+1 day') FROM learning_log l1 WHERE NOT EXISTS (SELECT 1 FROM learning_log l2 WHERE date(l2.date, '+1 day') = l1.date)), '1970-01-01')
      `).first(),
      DB.prepare("SELECT MAX(c) as max FROM (SELECT COUNT(*) as c FROM learning_log GROUP BY strftime('%W', date) || '-' || strftime('%Y', date) ORDER BY 1 DESC)").first(),
      DB.prepare("SELECT COUNT(*) as c FROM learning_log WHERE date >= date('now', 'weekday 0', '-7 days') AND date < date('now', 'weekday 0')").first(),
      DB.prepare("SELECT COUNT(*) as c FROM learning_log WHERE date >= date('now', 'weekday 0')").first(),
      DB.prepare(`
        SELECT creator,
          COUNT(*) as total,
          ROUND(AVG(user_score), 1) as avg_score,
          SUM(CASE WHEN user_rating='love' THEN 1 ELSE 0 END) as loves,
          SUM(CASE WHEN user_rating='like' THEN 1 ELSE 0 END) as likes
        FROM recommendations
        WHERE status='consumed' AND creator IS NOT NULL AND creator != '' AND user_score IS NOT NULL
        GROUP BY creator HAVING total >= 2
        ORDER BY avg_score DESC LIMIT 15
      `).all()
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
      allEntriesLimit: allLimit,
      allEntriesOffset: allOffset,
      htmlVault: htmlVault?.results || [],
      streak: streakConsecutive?.streak || 0,
      streakMaxAllTime: streakMax?.max || 0,
      weeklyDigest: {
        lastWeek: weekLast?.c || 0,
        thisWeek: weekThis?.c || 0
      },
      ratingByCreator: ratingByCreator?.results || []
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
  try {
    const [fts, nodes, vault, patterns] = await Promise.all([
      DB.prepare("SELECT source, ref_id FROM search_idx WHERE search_idx MATCH ? LIMIT 16").bind(q).all(),
      DB.prepare("SELECT id, label, type, status, super_category FROM tree_nodes WHERE id LIKE ? OR label LIKE ? ORDER BY type, id LIMIT 8").bind(`%${q}%`, `%${q}%`).all(),
      DB.prepare("SELECT id, filename, created_at FROM html_files WHERE filename LIKE ? ORDER BY created_at DESC LIMIT 8").bind(`%${q}%`).all(),
      DB.prepare("SELECT id, description, strength FROM patterns WHERE id LIKE ? OR description LIKE ? ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END LIMIT 8").bind(`%${q}%`, `%${q}%`).all()
    ]);
    const recIds = [];
    for (const r of fts.results || []) {
      if (r.source === "rec") recIds.push(r.ref_id);
    }
    let recs = [];
    if (recIds.length > 0) {
      const placeholders = recIds.map(() => "?").join(",");
      const res = await DB.prepare(
        `SELECT id, video_title as title, creator, content_type, status, user_rating
         FROM recommendations WHERE id IN (${placeholders}) ORDER BY created_at DESC`
      ).bind(...recIds).all();
      recs = res.results || [];
    }
    return c.json({
      q,
      groups: {
        recs,
        nodes: nodes.results || [],
        vault: vault.results || [],
        patterns: patterns.results || []
      }
    });
  } catch {
    const like = `%${q}%`;
    const [recs, nodes, vault, patterns] = await Promise.all([
      DB.prepare(`SELECT id, video_title as title, creator, content_type, status, user_rating FROM recommendations WHERE video_title LIKE ? OR creator LIKE ? OR why_this LIKE ? ORDER BY created_at DESC LIMIT 8`).bind(like, like, like).all(),
      DB.prepare(`SELECT id, label, type, status, super_category FROM tree_nodes WHERE id LIKE ? OR label LIKE ? ORDER BY type, id LIMIT 8`).bind(like, like).all(),
      DB.prepare(`SELECT id, filename, created_at FROM html_files WHERE filename LIKE ? ORDER BY created_at DESC LIMIT 8`).bind(like).all(),
      DB.prepare(`SELECT id, description, strength FROM patterns WHERE id LIKE ? OR description LIKE ? ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END LIMIT 8`).bind(like, like).all()
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
  }
});
var search_default = app6;

// src/api/enhance.ts
var app7 = new Hono2();
function localEnhance(text, item) {
  const t = (text || "").trim() || (item?.user_review || "").trim() || (item?.why_this || "").trim();
  if (!t) return "Write a sentence of feedback first, then enhance it.";
  return t.replace(/\s+/g, " ").trim().slice(0, 280);
}
__name(localEnhance, "localEnhance");
app7.post("/enhance", async (c) => {
  const { DB } = c.env;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  let item = null;
  if (body.id) {
    const row = await DB.prepare("SELECT * FROM recommendations WHERE id = ?").bind(body.id).first();
    item = row || null;
  }
  const content = (body.text || "").trim() || (item?.user_review || "").trim() || (item?.why_this || "").trim();
  const title = (body.video_title || item?.video_title || "").trim();
  const creator = (body.creator || item?.creator || "").trim();
  const type = (body.content_type || item?.content_type || "video").trim();
  if (!content) {
    return c.json({ text: localEnhance("", item), source: "local" });
  }
  const key = c.env.GOOGLE_API_KEY;
  if (key) {
    try {
      const ctx = [
        title && `Title: ${title}`,
        creator && `Creator: ${creator}`,
        `Type: ${type}`
      ].filter(Boolean).join("\n");
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const tooThin = wordCount <= 3;
      const seed = tooThin ? `The curator's note is too vague to sharpen: "${content}". Do NOT invent specifics. Reply with exactly this, unchanged: ${content}` : `Rewrite the curator's note below as a clean, well-structured review. You MUST write at least 2 complete sentences. Rules:
- Use ONLY facts, opinions, and specifics the curator already wrote. Do NOT add any new claims, new details, new judgments, or recommendations that were not in the note.
- You may tighten wording, fix grammar, expand into as many sentences as the note naturally supports, and improve flow \u2014 but the verdict and every concrete point must come from the note, never from you.
- No preamble, no emoji, no hype words.

Context:
${ctx}

Curator's note:
${content}`;
      const upstream = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + encodeURIComponent(key),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "You are a strict copy editor. You MAY ONLY tighten and clean up the curator's own written words. You are forbidden from inventing content, specifics, or verdicts the curator did not write. If the note is too thin to improve, return it unchanged. Return only the polished note \u2014 nothing else." }] },
            contents: [{ parts: [{ text: seed }] }],
            generationConfig: { maxOutputTokens: 1024, temperature: 0.3 }
          })
        }
      );
      if (upstream.ok) {
        const j = await upstream.json();
        const out = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (out) return c.json({ text: out, source: "ai" });
      } else {
        console.warn("enhance upstream status", upstream.status);
      }
    } catch (e) {
      console.warn("enhance upstream failed, falling back", e);
    }
  }
  return c.json({ text: localEnhance(content, item), source: "local" });
});
app7.post("/enhance/why", async (c) => {
  const { DB } = c.env;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const title = (body.video_title || "").trim();
  if (!title) return c.json({ text: "", source: "empty" });
  const key = c.env.GOOGLE_API_KEY;
  if (!key) return c.json({ text: "", source: "none" });
  const ctx = [
    title && `Title: ${title}`,
    body.creator && `Creator: ${body.creator}`,
    body.content_type && `Type: ${body.content_type}`
  ].filter(Boolean).join("\n");
  try {
    const upstream = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + encodeURIComponent(key),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You recommend content to a curious autodidact who loves behavioral psych, systems thinking, Islamic philosophy, investing, and persuasive design. Given a title and context, write 1-2 short sentences explaining WHY this content fits their interests. Be specific. No hype words. No emoji." }] },
          contents: [{ parts: [{ text: `Context:
${ctx}

Write a 1-2 sentence note explaining why this fits the curator's interests. Be specific about what angle or insight it might offer. Return only the note \u2014 nothing else.` }] }],
          generationConfig: { maxOutputTokens: 256, temperature: 0.4 }
        })
      }
    );
    if (upstream.ok) {
      const j = await upstream.json();
      const out = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out) return c.json({ text: out, source: "ai" });
    }
  } catch {
  }
  return c.json({ text: "", source: "none" });
});
var enhance_default = app7;

// src/shell.ts
var htmlShell = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Taste Map</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0d9182" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f8f9fb" media="(prefers-color-scheme: light)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Taste Map">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='3' fill='%233dd6c6'/></svg>">
<link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='3' fill='%233dd6c6'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" crossorigin>
<style>/* Prevent FOUT */ html{font-family:var(--font-ui)}</style>
<link rel="stylesheet" href="/static/app.css?v=14">
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
      <button class="nav-btn" data-ws="vault" aria-label="Vault">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span class="nav-label">Vault</span>
        <span class="nav-badge" id="nav-badge-vault" hidden>0</span>
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
        <input class="palette-input" id="palette-input" type="text" placeholder="Search recs, nodes, vault, patterns\u2026" autocomplete="off" spellcheck="false" aria-label="Search across recs, nodes, vault, and patterns">
        <span class="palette-hint" title="Close search (ESC)">ESC to close</span>
      </div>
      <div class="palette-body" id="palette-body">
        <div class="palette-empty">Type to search recs, brain nodes, vault files, and patterns</div>
      </div>
    </div>
  </div>

  <div class="batch-bar" id="batch-bar" role="region" aria-label="Bulk actions for selected items">
    <span class="batch-count" id="batch-count" aria-live="polite">0 selected</span>
    <div class="batch-actions">
      <button class="btn btn-sm" id="batch-consumed" title="Mark all selected as consumed and log a review">Mark done</button>
      <button class="btn btn-sm" id="batch-reject" title="Reject all selected \u2014 they will not be resurfaced">Reject</button>
      <button class="btn btn-sm btn-ghost" id="batch-clear" title="Clear selection">Clear</button>
    </div>
  </div>

  <div class="toast-stack" id="toast-stack"></div>

  <button class="fab" id="fab-new" aria-label="New entry" title="New entry (n)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
  </button>

    <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"><\/script>
    <script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})}<\/script>
    <script src="/static/app.js?v=22"><\/script>
</body>
</html>`;

// src/assets/css.ts
var cssBundle = `/* ===== Tokens ===== */
:root {
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  --bg: oklch(0.16 0.014 60);
  --surface: oklch(0.21 0.016 60);
  --elevated: oklch(0.26 0.018 60);
  --overlay: oklch(0.31 0.020 60);
  --border: oklch(0.34 0.016 60);
  --border-strong: oklch(0.44 0.020 60);

  --ink: oklch(0.96 0.012 75);
  --ink-2: oklch(0.78 0.020 70);
  --ink-3: oklch(0.74 0.022 65);

  /* Derived hover/layer tokens (were referenced but never defined) */
  --surface-hov: oklch(0.24 0.017 60);
  --surface-1: oklch(0.23 0.018 60);
  --ink-2-bg: color-mix(in oklch, var(--ink-2) 14%, transparent);
  --rejected-bg: color-mix(in oklch, var(--rejected) 15%, transparent);
  --accent-bg: color-mix(in oklch, var(--accent) 15%, transparent);

  --accent: oklch(0.80 0.135 65);
  --accent-ink: oklch(0.18 0.04 60);
  --accent-tint: color-mix(in oklch, var(--accent) 16%, transparent);
  --accent-glow: color-mix(in oklch, var(--accent) 22%, transparent);

  --active: oklch(0.82 0.14 75);
  --consumed: oklch(0.78 0.13 55);
  --rejected: oklch(0.70 0.17 30);
  --aging: oklch(0.80 0.13 60);

  --r-ctl: 6px;
  --r-card: 10px;
  --r-sheet: 12px;

  --ease: cubic-bezier(0.25, 1, 0.5, 1);
  --dur: 150ms;

  --sidebar-w: 68px;
  --sheet-w: 480px;
  --content-w: 1080px;

  --z-sticky: 10;
  --z-fab: 30;
  --z-batch: 35;
  --z-sheet: 40;
  --z-modal: 50;
  --z-toast: 60;
  --z-palette: 70;
}

[data-theme="light"] {
  --bg: oklch(0.985 0.004 75);
  --surface: oklch(0.97 0.006 75);
  --surface-hov: oklch(0.94 0.008 75);
  --surface-1: oklch(0.95 0.008 75);
  --elevated: oklch(0.96 0.008 75);
  --overlay: oklch(0.93 0.008 75);
  --border: oklch(0.88 0.006 75);
  --border-strong: oklch(0.80 0.008 75);
  --ink: oklch(0.18 0.012 70);
  --ink-2: oklch(0.40 0.018 70);
  --ink-3: oklch(0.62 0.020 70);
  --ink-2-bg: color-mix(in oklch, var(--ink-2) 10%, transparent);
  --rejected-bg: color-mix(in oklch, var(--rejected) 10%, transparent);
  --accent-bg: color-mix(in oklch, var(--accent) 10%, transparent);
  --accent: oklch(0.58 0.135 60);
  --accent-ink: oklch(0.99 0.005 75);
  --accent-tint: color-mix(in oklch, var(--accent) 12%, transparent);
  --active: oklch(0.62 0.14 65);
  --consumed: oklch(0.56 0.12 55);
  --rejected: oklch(0.55 0.18 30);
}

/* ===== Reset ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.55;
  letter-spacing: 0.01em;
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow: hidden;
  display: flex;
}
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
input, select, textarea { font: inherit; color: inherit; outline: none; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 2px; }
h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25; }
h2 { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; }
h3 { font-size: 13px; font-weight: 600; color: var(--ink-2); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
::selection { background: var(--accent-tint); color: var(--ink); }

:focus { outline: none; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.input:focus-visible, .textarea:focus-visible, .select:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-tint);
}

.kb-focus {
  outline: 2px solid var(--accent) !important;
  outline-offset: 2px;
  border-radius: var(--r-card);
}

/* ===== Layout ===== */
.sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
  gap: 6px;
  z-index: var(--z-sticky);
}
.sidebar-brand { width: 40px; height: 40px; display: grid; place-items: center; color: var(--accent); margin-bottom: 10px; border-radius: var(--r-ctl); background: var(--accent-tint); }
.sidebar-brand svg { width: 18px; height: 18px; }
.sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.nav-btn { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--r-ctl); color: var(--ink-2); position: relative; }
.nav-btn svg { width: 18px; height: 18px; }
.nav-btn:hover { background: var(--elevated); color: var(--ink); }
.nav-btn.active { background: var(--accent-tint); color: var(--accent); }
.nav-btn.active::before { content: ''; position: absolute; left: -11px; top: 50%; translate: 0 -50%; width: 3px; height: 18px; border-radius: 2px; background: var(--accent); }
.nav-label { display: none; }
/* DESIGN.md: collapsed rail should still read as icon + label. Show labels on desktop/tablet. */
@media (min-width: 721px) {
  :root { --sidebar-w: 132px; }
  .nav-btn { width: 116px; height: auto; min-height: 44px; grid-auto-flow: column; gap: 10px; justify-content: flex-start; padding: 0 12px; border-radius: var(--r-ctl); }
  .nav-label { display: inline; font-size: 13px; font-weight: 500; color: inherit; }
  .nav-badge { top: 50%; right: 10px; translate: 0 -50%; }
  .nav-btn.active::before { left: -15px; height: 22px; }
}
.sidebar-foot { margin-top: auto; }

.workspace { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--bg); }
.ws-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 20px 28px 10px; border-bottom: 1px solid var(--border); }
.ws-sub { color: var(--ink-2); font-size: 12.5px; margin-top: 2px; }
.ws-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.ws-subnav { display: flex; gap: 4px; padding: 8px 28px; border-bottom: 1px solid var(--border); background: var(--bg); }
.seg { display: inline-flex; gap: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.seg-btn { padding: 5px 12px; font-size: 12.5px; font-weight: 500; border-radius: 6px; color: var(--ink-2); display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.seg-btn:hover { color: var(--ink); }
.seg-btn.active { background: var(--elevated); color: var(--ink); box-shadow: 0 1px 0 oklch(0 0 0 / 0.15); }
.seg-count { font-size: 10px; font-family: var(--font-mono); color: var(--ink-3); background: var(--bg); padding: 1px 5px; border-radius: 6px; min-width: 1.3em; text-align: center; }
.seg-btn.active .seg-count { color: var(--accent); background: var(--accent-tint); }
.ws-body { flex: 1; overflow-y: auto; padding: 20px 28px 80px; }

/* ===== Filter bar (dropdown-based \u2014 user's design) ===== */
.filters-bar { display: flex; flex-wrap: wrap; gap: 4px 8px; padding: 10px 28px; border-bottom: 1px solid var(--border); background: var(--bg); align-items: center; }
.fs-group { display: flex; align-items: center; gap: 2px; }
.fs-label { font-size: 10.5px; color: var(--ink-3); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
.fs-select { height: 28px; padding: 0 6px; font-size: 12px; background: transparent; border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink); outline: none; cursor: pointer; min-width: 80px; }
.fs-select:hover { border-color: var(--border-strong); }
.fs-toggle { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-3); padding: 4px 8px; border-radius: var(--r-ctl); cursor: pointer; transition: all var(--dur) var(--ease); background: transparent; border: 1px solid transparent; }
.fs-toggle:hover { color: var(--ink-2); border-color: var(--border); }
.fs-toggle.on { color: var(--accent); background: var(--accent-tint); border-color: transparent; }
.fs-toggle svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.fs-input { height: 28px; padding: 0 8px; font-size: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink); outline: none; min-width: 120px; }
.fs-input::placeholder { color: var(--ink-3); }
.fs-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-tint); }
.fs-icon { position: absolute; left: 8px; top: 50%; translate: 0 -50%; pointer-events: none; }
.fs-input-wrap { position: relative; display: inline-flex; align-items: center; }
.fs-input-wrap .fs-input { padding-left: 28px; }

/* ===== Buttons ===== */
.btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; font-size: 12.5px; font-weight: 500; border-radius: var(--r-ctl); color: var(--ink); border: 1px solid var(--border); background: var(--surface); }
.btn:hover { background: var(--elevated); border-color: var(--border-strong); }
.btn.loading { position: relative; color: transparent !important; pointer-events: none; }
.btn.loading::after { content: ''; position: absolute; width: 13px; height: 13px; top: 50%; left: 50%; margin: -6.5px 0 0 -6.5px; border: 2px solid var(--ink-3); border-top-color: var(--ink); border-radius: 50%; animation: spin 600ms linear infinite; }
.btn svg { width: 13px; height: 13px; }
.btn-primary { background: var(--accent); border-color: transparent; color: var(--accent-ink); font-weight: 600; }
.btn-primary:hover { filter: brightness(1.08); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--ink-2); }
.btn-ghost:hover { background: var(--elevated); color: var(--ink); }
.btn-danger { color: var(--rejected); }
.btn-danger:hover { background: color-mix(in oklch, var(--rejected) 12%, transparent); border-color: color-mix(in oklch, var(--rejected) 40%, transparent); }
.btn-icon { width: 32px; padding: 0; justify-content: center; }
.btn-disabled { opacity: 0.3; cursor: default; pointer-events: none; }
.btn-sm { height: 26px; padding: 0 10px; font-size: 11.5px; }
.btn-group { display: inline-flex; gap: 1px; }
.btn-group .btn { border-radius: 0; }
.btn-group .btn:first-child { border-radius: var(--r-ctl) 0 0 var(--r-ctl); }
.btn-group .btn:last-child { border-radius: 0 var(--r-ctl) var(--r-ctl) 0; }
.btn-group .btn.active { background: var(--accent-tint); color: var(--accent); border-color: var(--accent); }

/* ===== Queue Cards (user's design) ===== */
.queue-cards { display: flex; flex-direction: column; max-width: var(--content-w); gap: 0; position: relative; }
.qc-card { padding: 14px 16px; border-bottom: 1px solid var(--border); transition: background var(--dur) var(--ease); }
.qc-card:last-child { border-bottom: 0; }

/* ===== Queue Drag Reorder ===== */
.qc-card.dragging { opacity: 0.4; }
.qc-card.drag-over { border-top: 2px solid var(--accent); }
.qc-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: transparent;
  transition: background var(--dur) var(--ease);
}
.qc-card:hover::before { background: var(--accent); }
.qc-card:hover { background: color-mix(in oklch, var(--surface) 50%, transparent); }
.qc-row1 { display: flex; align-items: flex-start; gap: 10px; }
.qc-row1 .chk { margin-top: 3px; flex-shrink: 0; }
.qc-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 7px; }
.qc-body { flex: 1; min-width: 0; }
.qc-title { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-sub { font-size: 12px; color: var(--ink-2); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-bundle { font-size: 10.5px; font-weight: 500; padding: 2px 8px; border-radius: 6px; background: color-mix(in oklch, var(--accent) 15%, transparent); color: var(--accent); white-space: nowrap; }
.qc-branch { font-size: 10.5px; font-weight: 500; padding: 2px 8px; border-radius: 6px; background: color-mix(in oklch, var(--consumed) 15%, transparent); color: var(--consumed); white-space: nowrap; }
.qc-card.swiping-right { background: color-mix(in oklch, var(--consumed) 18%, transparent) !important; transform: translateX(20px); }
.qc-card.swiping-left { background: color-mix(in oklch, var(--rejected) 18%, transparent) !important; transform: translateX(-20px); }
.queue-cards.density-compact .qc-card { padding: 8px 12px; }
.queue-cards.density-compact .qc-desc { display: none; }
.queue-cards.density-compact .qc-actions { margin-top: 4px; }
.qc-card.card-aging { background: color-mix(in oklch, var(--aging) 5%, transparent); }
.qc-card.card-stale { background: color-mix(in oklch, var(--rejected) 5%, transparent); }


/* ===== Status dots (dot-only, reused) ===== */
.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.dot-active { background: var(--active); }
.dot-consumed { background: var(--consumed); }
.dot-rejected { background: var(--rejected); }

/* ===== Queue ===== */
.queue { display: flex; flex-direction: column; max-width: var(--content-w); }
.queue-card { display: flex; gap: 12px; align-items: flex-start; padding: 14px 4px; background: transparent; border-bottom: 1px solid var(--border); animation: rise 200ms var(--ease) backwards; }
.queue-card:last-child { border-bottom: 0; }
.queue-card:hover { background: color-mix(in oklch, var(--surface) 60%, transparent); }
.q-dot { margin-top: 8px; }
.q-main { flex: 1; min-width: 0; }
.q-title { font-size: 14.5px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); line-height: 1.35; }
.q-meta { font-size: 12px; color: var(--ink-2); margin-top: 4px; }
.q-meta span { display: inline-flex; align-items: center; gap: 4px; }
.q-meta .sep { color: var(--ink-3); margin: 0 4px; }
.q-why { margin-top: 8px; font-size: 13.5px; color: var(--ink-2); line-height: 1.5; max-width: 72ch; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.q-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }

/* ===== Queue Dashboard ===== */
.queue-dashboard { max-width: var(--content-w); margin-bottom: 20px; }
.queue-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
.queue-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 12px 14px; }
.queue-stat .qs-val { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.queue-stat .qs-label { font-size: 11px; color: var(--ink-2); font-weight: 500; margin-top: 2px; }
.qs-val.c-active { color: var(--active); }
.qs-val.c-consumed { color: var(--consumed); }
.qs-val.c-rejected { color: var(--rejected); }
.queue-types { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.queue-stale-banner {
  padding: 10px 14px;
  border-radius: var(--r-ctl);
  background: color-mix(in oklch, var(--rejected) 6%, transparent);
  border: 1px solid color-mix(in oklch, var(--rejected) 20%, transparent);
  font-size: 12px;
  color: var(--ink-2);
  margin-bottom: 14px;
}
.queue-stale-banner strong { color: var(--rejected); font-weight: 600; }

/* Aging / stale rows */
.queue-card.card-aging { background: color-mix(in oklch, var(--aging) 5%, transparent); }
.queue-card.card-stale { background: color-mix(in oklch, var(--rejected) 5%, transparent); }

.chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; background: var(--elevated); color: var(--ink-2); border: 1px solid var(--border); }
.chip-accent { background: var(--accent-tint); color: var(--accent); border-color: transparent; }
.chip-active { color: var(--active); border-color: color-mix(in oklch, var(--active) 30%, transparent); }
.chip-consumed { color: var(--consumed); }
.chip-rejected { color: var(--rejected); }

/* ===== Filter bar (restructured) ===== */
.filters-bar { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 8px 28px; border-bottom: 1px solid var(--border); background: var(--bg); align-items: center; }
.filter-group { display: flex; align-items: center; gap: 4px; }
.filter-label { font-size: 11px; color: var(--ink-3); font-weight: 500; margin-right: 2px; text-transform: uppercase; letter-spacing: 0.03em; }
.filter-chip { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 6px; background: transparent; color: var(--ink-3); border: 1px solid transparent; cursor: pointer; transition: all var(--dur) var(--ease); }
.filter-chip:hover { color: var(--ink-2); border-color: var(--border); }
.filter-chip.on { background: var(--accent-tint); color: var(--accent); border-color: transparent; }
.filter-chip.reset { color: var(--rejected); }
.filter-input { height: 26px; padding: 0 8px; font-size: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink); max-width: 140px; }
.filter-input::placeholder { color: var(--ink-3); }

/* ===== Stats / Charts ===== */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 24px; max-width: var(--content-w); }
.stat-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 14px 16px; }
.stat-block .s-label { font-size: 11px; color: var(--ink-2); font-weight: 500; }
.stat-block .s-value { font-size: 26px; font-weight: 600; letter-spacing: -0.025em; margin-top: 4px; font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat-block .s-sub { font-size: 11px; color: var(--ink-3); margin-top: 3px; }
.s-value.c-accent { color: var(--accent); }
.s-value.c-active { color: var(--active); }
.s-value.c-consumed { color: var(--consumed); }
.s-value.c-rejected { color: var(--rejected); }

.chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 16px; margin-bottom: 16px; max-width: var(--content-w); }
.chart-title { font-size: 12px; font-weight: 600; color: var(--ink-2); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.chart-title .count { font-weight: 400; font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); }

.bar-chart { display: flex; flex-direction: column; gap: 4px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-row .b-label { font-size: 12px; color: var(--ink-2); width: 100px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-row .b-label.mono { font-family: var(--font-mono); font-size: 11px; width: 80px; }
.bar-row .b-track { flex: 1; height: 8px; background: var(--elevated); border-radius: 4px; overflow: hidden; }
.bar-row .b-fill { height: 100%; border-radius: 4px; background: var(--accent); transition: width 800ms var(--ease); }
.bar-row .b-fill.c-consumed { background: var(--consumed); }
.bar-row .b-fill.c-active { background: var(--active); }
.bar-row .b-fill.c-rejected { background: var(--rejected); }
.bar-row .b-count { font-family: var(--font-mono); font-size: 11px; color: var(--ink); min-width: 28px; text-align: right; transition: all 800ms var(--ease); }

.rating-dist { display: flex; gap: 0; height: 24px; border-radius: 6px; overflow: hidden; }
.rating-seg { display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: var(--bg); transition: width 800ms var(--ease); }
.rating-seg.r-love { background: var(--active); }
.rating-seg.r-like { background: var(--consumed); }
.rating-seg.r-meh { background: var(--ink-3); }
.rating-seg.r-dislike { background: var(--rejected); }

.month-chart { display: flex; align-items: flex-end; gap: 4px; height: 80px; padding-top: 4px; }
.month-bar { flex: 1; border-radius: 3px 3px 0 0; background: var(--consumed); transition: height 800ms var(--ease); min-height: 2px; position: relative; }
.month-bar .mb-val { position: absolute; bottom: 100%; left: 50%; translate: -50% -4px; font-size: 9px; color: var(--ink-3); font-family: var(--font-mono); white-space: nowrap; }
.month-bar .mb-label { position: absolute; top: 100%; left: 50%; translate: -50% 4px; font-size: 9px; color: var(--ink-3); font-family: var(--font-mono); }

/* ===== Archive ===== */
.archive { max-width: 880px; }
.archive-day { margin-bottom: 24px; }
.archive-date { font-size: 11px; font-weight: 600; color: var(--ink-3); margin-bottom: 6px; letter-spacing: 0.02em; }
.archive-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--border); }
.archive-item:last-child { border-bottom: 0; }
.archive-item .a-main { flex: 1; min-width: 0; }
.a-title { font-size: 13.5px; font-weight: 500; color: var(--ink); line-height: 1.35; }
.a-meta { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
.a-review { margin-top: 6px; font-size: 13px; color: var(--ink-2); font-style: italic; padding-left: 10px; border-left: 2px solid var(--border-strong); max-width: 64ch; line-height: 1.5; }

.rating-tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; text-transform: capitalize; white-space: nowrap; }
.rating-love { background: color-mix(in oklch, var(--active) 18%, transparent); color: var(--active); }
.rating-like { background: color-mix(in oklch, var(--consumed) 15%, transparent); color: var(--consumed); }
.rating-meh { background: var(--elevated); color: var(--ink-2); }
.rating-dislike { background: color-mix(in oklch, var(--rejected) 15%, transparent); color: var(--rejected); }

/* ===== Sheet ===== */
.sheet-backdrop { position: fixed; inset: 0; background: oklch(0.03 0.01 240 / 0.55); opacity: 0; pointer-events: none; transition: opacity var(--dur) var(--ease); z-index: var(--z-sheet); }
.sheet-backdrop.open { opacity: 1; pointer-events: auto; }
.sheet { position: fixed; top: 0; right: 0; bottom: 0; width: min(var(--sheet-w), 100vw); background: var(--surface); border-left: 1px solid var(--border); transform: translateX(100%); transition: transform 250ms cubic-bezier(0.32, 0.72, 0, 1); z-index: calc(var(--z-sheet) + 1); display: flex; flex-direction: column; overflow-y: auto; }
.sheet.open { transform: none; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); z-index: 1; }
.sheet-body { padding: 20px; flex: 1; }
.sheet-foot { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }

.field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
.field label { font-size: 11.5px; font-weight: 500; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.03em; }
.input, .textarea, .select { background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-ctl); padding: 8px 11px; font-size: 13px; color: var(--ink); outline: none; transition: border-color var(--dur) var(--ease); width: 100%; }
.input::placeholder, .textarea::placeholder { color: var(--ink-3); }
.textarea { min-height: 80px; resize: vertical; font-family: inherit; line-height: 1.5; }

.rating-picker { display: flex; gap: 6px; }
.rating-opt { flex: 1; padding: 10px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-ctl); font-size: 12px; font-weight: 500; color: var(--ink-2); transition: all var(--dur) var(--ease); text-align: center; }
.rating-opt:hover { border-color: var(--border-strong); color: var(--ink); }
.rating-opt.selected[data-r="love"] { background: color-mix(in oklch, var(--active) 18%, transparent); border-color: var(--active); color: var(--active); }
.rating-opt.selected[data-r="like"] { background: color-mix(in oklch, var(--consumed) 15%, transparent); border-color: var(--consumed); color: var(--consumed); }
.rating-opt.selected[data-r="meh"] { background: var(--elevated); border-color: var(--ink-3); color: var(--ink); }
.rating-opt.selected[data-r="dislike"] { background: color-mix(in oklch, var(--rejected) 15%, transparent); border-color: var(--rejected); color: var(--rejected); }

/* ===== Modal ===== */
.modal-backdrop { position: fixed; inset: 0; background: oklch(0.03 0.01 240 / 0.5); display: grid; place-items: center; opacity: 0; pointer-events: none; transition: opacity var(--dur) var(--ease); z-index: var(--z-modal); }
.modal-backdrop.open { opacity: 1; pointer-events: auto; }
.modal { width: min(460px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--r-sheet); padding: 20px; transform: scale(0.97); transition: transform 200ms var(--ease); max-height: 90vh; overflow-y: auto; }
.modal-backdrop.open .modal { transform: none; }

/* ===== Toast ===== */
.toast-stack { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 6px; z-index: var(--z-toast); pointer-events: none; }
.toast { background: var(--overlay); border: 1px solid var(--border-strong); color: var(--ink); padding: 10px 14px; border-radius: var(--r-ctl); font-size: 12.5px; animation: toastIn 200ms var(--ease); box-shadow: 0 6px 20px oklch(0 0 0 / 0.35); max-width: 340px; pointer-events: auto; }
.toast.t-err { border-color: var(--rejected); color: var(--rejected); }
.toast-undo { display: flex; align-items: center; gap: 8px; }
.toast-undo button { background: var(--accent); color: var(--accent-ink); border: 0; padding: 4px 10px; border-radius: var(--r-ctl); font-size: 11px; font-weight: 600; cursor: pointer; }

/* ===== Canvas ===== */
.canvas-stage { position: relative; background: var(--surface); border: 1px solid var(--border-strong); border-radius: 14px; height: calc(100vh - 160px); min-height: 520px; overflow: hidden; cursor: grab; isolation: isolate; contain: layout paint; box-shadow: inset 0 0 40px oklch(0 0 0 / 0.35); }
.canvas-stage:active { cursor: grabbing; }
.canvas-stage--radial { background: radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--accent) 7%, var(--surface)) 0%, var(--surface) 75%); }
.canvas-ctrls { position: absolute; bottom: 16px; right: 16px; display: flex; gap: 4px; z-index: 5; align-items: center; background: color-mix(in oklch, var(--overlay) 80%, transparent); border: 1px solid var(--border-strong); border-radius: 12px; padding: 4px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 8px 24px oklch(0 0 0 / 0.4); }
.canvas-btn { width: 34px; height: 34px; background: transparent; border: 1px solid transparent; border-radius: 8px; color: var(--ink); display: grid; place-items: center; font-size: 14px; transition: all 140ms var(--ease); cursor: pointer; }
.canvas-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-tint); transform: translateY(-1px); }
.canvas-zoom-pct { font-family: var(--font-mono); font-size: 11px; font-weight: 500; color: var(--ink-2); padding: 0 8px; min-width: 42px; text-align: center; }
.canvas-search { position: absolute; top: 16px; left: 16px; width: 220px; z-index: 5; background: color-mix(in oklch, var(--overlay) 82%, transparent); border: 1px solid var(--border-strong); border-radius: 12px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 9px 14px; color: var(--ink); font-size: 12.5px; box-shadow: 0 8px 24px oklch(0 0 0 / 0.35); outline: none; transition: border-color 140ms var(--ease), box-shadow 140ms var(--ease); }
.canvas-search:focus { border-color: var(--accent); box-shadow: 0 8px 24px oklch(0 0 0 / 0.35), 0 0 0 3px color-mix(in oklch, var(--accent) 30%, transparent); }
.canvas-search-results { position: absolute; top: 56px; left: 16px; width: 290px; background: var(--overlay); border: 1px solid var(--border-strong); border-radius: var(--r-card); box-shadow: 0 12px 32px oklch(0 0 0 / 0.45); z-index: 6; max-height: 260px; overflow-y: auto; display: none; padding: 6px 0; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.canvas-search-results.open { display: block; }

/* Canvas tooltip */
.canvas-tooltip { position: absolute; z-index: 10; pointer-events: none; background: color-mix(in oklch, var(--overlay) 94%, transparent); border: 1px solid var(--border-strong); border-radius: 12px; padding: 12px 16px; box-shadow: 0 12px 32px oklch(0 0 0 / 0.5); opacity: 0; transform: translateY(4px); transition: opacity 140ms var(--ease), transform 140ms var(--ease); max-width: 260px; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.canvas-tooltip.open { opacity: 1; transform: translateY(0); }
.tt-label { font-size: 13.5px; font-weight: 600; color: var(--ink); line-height: 1.35; }
.tt-meta { font-size: 11px; color: var(--ink-2); margin-top: 3px; }
.tt-id { font-size: 10px; color: var(--ink-3); margin-top: 4px; }

/* Canvas minimap */
.canvas-minimap { position: absolute; bottom: 16px; left: 16px; z-index: 5; background: color-mix(in oklch, var(--overlay) 80%, transparent); border: 1px solid var(--border-strong); border-radius: 12px; padding: 6px; opacity: 0.92; transition: opacity 200ms var(--ease), border-color 200ms var(--ease); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 8px 24px oklch(0 0 0 / 0.35); }
.canvas-minimap:hover { opacity: 1; border-color: var(--accent); }
.canvas-minimap canvas { display: block; border-radius: 8px; }

.cy-mount { position: absolute; inset: 0; z-index: 1; }
.cy-deco { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; z-index: 0; }
.canvas-stage .canvas-tooltip { z-index: 12; }
.canvas-legend { position: absolute; top: 16px; right: 16px; z-index: 5; display: flex; flex-wrap: wrap; gap: 6px 10px; justify-content: flex-end; max-width: 260px; background: color-mix(in oklch, var(--overlay) 80%, transparent); border: 1px solid var(--border-strong); border-radius: 12px; padding: 10px 14px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 8px 24px oklch(0 0 0 / 0.35); }
.canvas-legend-item { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-2); }
.canvas-legend-dot { width: 8px; height: 8px; border-radius: 3px; box-shadow: 0 0 8px currentColor; }

/* ===== Radar Spider Chart ===== */
.radar-chart-wrap { display: flex; justify-content: center; padding: 20px 0 8px; }
.radar-spider { overflow: visible; }
.radar-ring { fill: none; stroke: var(--border); stroke-width: 1; }
.radar-axis { stroke: var(--border); stroke-width: 0.5; opacity: 0.5; }
.radar-data { fill: color-mix(in oklch, var(--accent) 15%, transparent); stroke: var(--accent); stroke-width: 2; }
.radar-dot { filter: drop-shadow(0 1px 3px oklch(0 0 0 / 0.3)); }
.radar-label { font-size: 11px; font-weight: 500; fill: var(--ink-2); font-family: var(--font-ui); }
.radar-details { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); }
.radar-detail-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.radar-dot-indicator { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.radar-detail-cat { font-weight: 500; color: var(--ink); min-width: 60px; }
.radar-detail-drift { font-family: var(--font-mono); font-size: 12px; min-width: 48px; text-align: right; }
.radar-detail-drift.pos { color: var(--consumed); }
.radar-detail-drift.neg { color: var(--active); }
.radar-detail-meta { font-size: 11px; color: var(--ink-3); margin-left: auto; }

/* Radar v2 layout */
.radar-baseline { padding: 10px 14px; border: 1px dashed var(--border-strong); border-radius: var(--r-card); color: var(--ink-2); font-size: 12.5px; margin-bottom: 16px; background: var(--surface); }
.radar-layout { display: grid; grid-template-columns: minmax(0, 400px) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .radar-layout { grid-template-columns: 1fr; } }
.radar-chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); }
.radar-anim { transform-box: fill-box; transform-origin: center; animation: radarIn 550ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes radarIn { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: scale(1); } }
.radar-ring-label { font-size: 9px; fill: var(--ink-3); font-family: var(--font-mono); }
.radar-prev { fill: none; stroke: var(--ink-3); stroke-width: 1.2; stroke-dasharray: 4 3; opacity: 0.65; }
.radar-dot, .radar-sector, .radar-label { cursor: pointer; }
.radar-dot.sel { stroke: var(--ink); stroke-width: 2; }
.radar-cat-list { display: flex; flex-direction: column; gap: 8px; }
.radar-cat-card { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); cursor: pointer; transition: border-color 150ms, background 150ms; text-align: left; width: 100%; font-family: var(--font-ui); font-size: 12.5px; color: var(--ink); }
.radar-cat-card:hover { border-color: var(--border-strong); }
.radar-cat-card.sel { border-color: var(--accent); background: var(--accent-tint); }
.radar-cat-name { font-weight: 500; min-width: 64px; }
.radar-cat-bar { flex: 1; height: 4px; background: var(--border); border-radius: 2px; position: relative; overflow: hidden; }
.radar-cat-bar::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--border-strong); }
.radar-cat-bar-fill { position: absolute; top: 0; bottom: 0; border-radius: 2px; }
.radar-cat-bar-fill.pos { background: var(--consumed); }
.radar-cat-bar-fill.neg { background: var(--active); }
.radar-cat-meta { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.radar-panel { margin-top: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 16px; }
.radar-panel-title { font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.radar-panel-sub { font-size: 11.5px; color: var(--ink-3); margin-bottom: 12px; }
.radar-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 700px) { .radar-cols { grid-template-columns: 1fr; } }
.radar-col-head { font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 8px; }
.radar-item { display: block; padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--r-ctl); margin-bottom: 6px; font-size: 12.5px; color: var(--ink); transition: border-color 150ms; }
a.radar-item:hover { border-color: var(--accent); color: var(--ink); }
.radar-item-meta { font-size: 11px; color: var(--ink-3); margin-top: 2px; }
.radar-none { font-size: 12px; color: var(--ink-3); padding: 6px 0; }

/* ===== Branches ===== */
.branch-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.branch-card { padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); cursor: pointer; }
.branch-card:hover { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 4%, var(--surface)); }
.branch-card .bc-id { font-family: var(--font-mono); font-size: 10px; color: var(--accent); }
.branch-card .bc-label { font-size: 13.5px; font-weight: 600; margin-top: 3px; }
.branch-card .bc-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 4px; }
.branch-card .bc-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.bc-spark { flex-shrink: 0; opacity: 0.8; }
.branch-card:hover .bc-spark { opacity: 1; }
.bc-mastery { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; color: var(--ink-3); }
.bar-mini { flex: 1; height: 4px; background: var(--elevated); border-radius: 2px; overflow: hidden; }
.bar-mini-fill { height: 100%; background: var(--consumed); border-radius: 2px; transition: width 600ms var(--ease); }
.bc-stale-pulse { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--rejected); margin-left: 4px; vertical-align: middle; animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.bc-age.fresh { color: var(--consumed); }
.bc-age.warm { color: var(--active); }
.bc-age.stale { color: var(--rejected); }

/* ===== Log / Journal ===== */
.digest { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 20px 24px; margin-bottom: 24px; max-width: 880px; }
.digest-date { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
.digest-day { font-size: 12px; color: var(--ink-3); margin-bottom: 12px; margin-top: 3px; }
.digest-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.digest-section-title { font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
.digest-item { font-size: 13px; padding: 4px 0; display: flex; gap: 8px; align-items: center; }
.digest-item a { color: var(--ink); }
.digest-item a:hover { color: var(--accent); }


/* ===== Streak Gamification ===== */
.stat-streak.streak-hot { border-color: var(--consumed); background: color-mix(in oklch, var(--consumed) 6%, var(--surface)); }
.stat-streak.streak-hot .s-value { color: var(--consumed); }
.streak-nudge {
  background: color-mix(in oklch, var(--consumed) 8%, var(--surface));
  border: 1px solid color-mix(in oklch, var(--consumed) 25%, var(--border));
  border-radius: var(--r-card);
  padding: 16px 20px;
  margin-bottom: 20px;
  max-width: 880px;
}
.streak-nudge-text { font-size: 14px; font-weight: 600; color: var(--ink); }
.streak-nudge-sub { font-size: 12px; color: var(--ink-2); margin-top: 4px; }
.heatmap-wrap { overflow-x: auto; padding: 8px 0 14px; }
.heatmap { display: flex; gap: 3px; }
.heatmap-col { display: flex; flex-direction: column; gap: 3px; }
.heatmap-cell { width: 11px; height: 11px; border-radius: 2px; background: var(--elevated); }
.heatmap-cell.l1 { background: color-mix(in oklch, var(--consumed) 25%, var(--elevated)); }
.heatmap-cell.l2 { background: color-mix(in oklch, var(--consumed) 48%, var(--elevated)); }
.heatmap-cell.l3 { background: color-mix(in oklch, var(--consumed) 70%, var(--elevated)); }
.heatmap-cell.l4 { background: var(--consumed); }
.heatmap-months { display: flex; gap: 3px; margin-bottom: 3px; font-size: 9px; color: var(--ink-3); font-family: var(--font-mono); }
.heatmap-months > span { width: 11px; text-align: center; }

/* ===== Vault ===== */
.vault-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.vault-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.vault-toggle {
  display: inline-flex;
  gap: 2px;
  background: var(--elevated);
  border-radius: 8px;
  padding: 3px;
  border: 1px solid var(--border);
}
.vault-toggle-btn {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 150ms var(--ease);
}
.vault-toggle-btn:hover { color: var(--ink-2); }
.vault-toggle-btn.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.06);
}
.vault-toggle-btn svg { width: 14px; height: 14px; flex-shrink: 0; }

.vault-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}
.vault-card {
  background: var(--surface);
  border-radius: 12px;
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  transition: box-shadow 200ms var(--ease), transform 200ms var(--ease), background 200ms var(--ease);
  animation: rise 350ms var(--ease) both;
  cursor: default;
}
.vault-card:hover {
  background: var(--surface-hov);
  transform: translateY(-2px);
}
.vault-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin-bottom: 4px;
  font-family: 'Inter', sans-serif;
}
.vault-card-icon.md { background: var(--ink-2-bg); color: var(--ink-2); }
.vault-card-icon.pdf { background: var(--rejected-bg); color: var(--rejected); }
.vault-card-icon.code { background: var(--accent-bg); color: var(--accent); }
.vault-card-icon.file { background: var(--elevated); color: var(--ink-3); }
.vault-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
  line-height: 1.3;
}
.vault-card-desc {
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.9em;
}

/* ===== Vault Card Preview ===== */
.vault-card-preview {
  height: 0;
  overflow: hidden;
  border-radius: 4px;
  margin-top: 4px;
  transition: height 300ms var(--ease), opacity 200ms var(--ease);
  opacity: 0;
  background: var(--bg);
  border: 1px solid var(--border);
}
.vault-card:hover .vault-card-preview {
  height: 120px;
  opacity: 1;
}
/* Touch devices: no hover, so reveal the preview inline instead of hover-only */
@media (hover: none) {
  .vault-card-preview {
    height: 120px;
    opacity: 1;
    margin-top: 10px;
  }
}
.vault-card-preview iframe {
  width: 100%;
  height: 100%;
  border: none;
  pointer-events: none;
  transform: scale(0.5);
  transform-origin: top left;
  width: 200%;
  height: 200%;
}
.vault-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 6px;
  min-height: 28px;
}
.vault-card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.vault-card-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--elevated);
  color: var(--ink-2);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.vault-card-del {
  font-size: 11px;
  color: var(--ink-3);
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: color 150ms, background 150ms;
  flex-shrink: 0;
}
.vault-card-del:hover {
  color: oklch(0.55 0.18 25);
  background: oklch(0.55 0.18 25 / 0.08);
}

/* Vault list view (fallback) */
.vault-list-wrap { display: flex; flex-direction: column; }
.vault-list-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: var(--surface);
  margin-bottom: 2px;
}
.vault-list-row:hover { background: var(--surface-hov); }
.vault-list-row:first-child { border-radius: 10px 10px 0 0; }
.vault-list-row:last-child { border-radius: 0 0 10px 10px; border-bottom: 0; }
.vault-list-name { font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
.vault-list-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 2px; }
.vault-list-actions { display: flex; gap: 6px; align-items: center; }

@media (max-width: 720px) {
  .vault-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .vault-card { padding: 14px; }
  .vault-head { flex-direction: column; align-items: flex-start; gap: 10px; }
}

/* ===== Palette ===== */
.palette-backdrop { position: fixed; inset: 0; background: oklch(0.03 0.01 240 / 0.45); opacity: 0; pointer-events: none; transition: opacity 150ms var(--ease); z-index: var(--z-palette); display: grid; place-items: start center; padding-top: 12vh; }
.palette-backdrop.open { opacity: 1; pointer-events: auto; }
.palette { width: min(580px, calc(100vw - 32px)); background: var(--overlay); border: 1px solid var(--border-strong); border-radius: var(--r-sheet); box-shadow: 0 16px 48px oklch(0 0 0 / 0.4); overflow: hidden; transform: scale(0.97) translateY(-8px); transition: transform 200ms var(--ease); max-height: 75vh; display: flex; flex-direction: column; }
.palette-backdrop.open .palette { transform: none; }
.palette-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); background: var(--elevated); }
.palette-input { flex: 1; border: 0; background: transparent; font-size: 14px; color: var(--ink); padding: 0; }
.palette-input::placeholder { color: var(--ink-3); }
.palette-body { max-height: 360px; overflow-y: auto; padding: 6px 0; }
.palette-item { display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; font-size: 13px; color: var(--ink); }
.palette-item:hover, .palette-item.highlighted { background: var(--accent-tint); }
.palette-item .pi-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-item .pi-meta { font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); }

/* ===== Empty / Skeleton ===== */
.empty { padding: 60px 24px; text-align: center; color: var(--ink-3); font-size: 13px; max-width: 380px; margin: 40px auto; line-height: 1.5; }
.empty .e-title { font-size: 15px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
.empty .btn { margin-top: 14px; }
.loading-skeleton { max-width: var(--content-w); }
.skel { background: linear-gradient(90deg, var(--surface) 25%, var(--elevated) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: var(--r-card); }
.skel-row { height: 60px; margin-bottom: 8px; }

/* ===== FAB ===== */
.fab { position: fixed; right: 20px; bottom: 20px; width: 48px; height: 48px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); border: 0; cursor: pointer; z-index: var(--z-fab); display: grid; place-items: center; box-shadow: 0 4px 16px color-mix(in oklch, var(--accent) 35%, transparent); transition: transform var(--dur) var(--ease); }
.fab:hover { transform: scale(1.06); }
.fab svg { width: 20px; height: 20px; }

/* ===== Topbar search ===== */
.topbar-search { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink-3); font-size: 12px; }
.topbar-search:hover { border-color: var(--border-strong); color: var(--ink-2); }
.topbar-search kbd { font-family: var(--font-mono); font-size: 9px; padding: 1px 5px; border-radius: 3px; background: var(--elevated); color: var(--ink-2); border: 1px solid var(--border); }

/* ===== Misc ===== */
.sec-title { font-size: 12px; font-weight: 600; color: var(--ink-2); margin: 24px 0 10px; display: flex; align-items: center; gap: 6px; }
.sec-title .count { font-weight: 400; font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); }
.mono { font-family: var(--font-mono); }
.muted { color: var(--ink-2); }
.dim { color: var(--ink-3); }

/* ===== Nav badges ===== */
.nav-badge { position: absolute; top: 3px; right: 3px; min-width: 14px; height: 14px; padding: 0 3px; background: var(--rejected); color: var(--bg); border-radius: 7px; font-size: 9px; font-weight: 700; font-family: var(--font-mono); display: grid; place-items: center; line-height: 1; }

/* ===== Batch bar ===== */
.batch-bar { position: fixed; bottom: -60px; left: 50%; translate: -50% 0; display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--overlay); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: 0 8px 28px oklch(0 0 0 / 0.4); z-index: var(--z-batch); transition: bottom 250ms var(--ease); }
.batch-bar.open { bottom: 24px; }
.batch-count { font-size: 12px; font-weight: 600; color: var(--ink); font-family: var(--font-mono); }
.batch-actions { display: flex; gap: 6px; }

/* ===== Key map ===== */
.kbd-table { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
.kbd-row { display: flex; align-items: center; gap: 8px; }
.kbd-row .kbd-keys { display: flex; gap: 3px; min-width: 100px; }
.kbd-row .kbd-desc { font-size: 12.5px; color: var(--ink-2); }
.kbd-keys kbd { font-family: var(--font-mono); font-size: 10px; padding: 2px 6px; border-radius: 3px; background: var(--bg); color: var(--ink); border: 1px solid var(--border); }

/* ===== Motion ===== */
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position: -200% 0; } }

/* ===== Responsive ===== */
@media (max-width: 720px) {
  body { flex-direction: column; }
  .sidebar { width: 100%; height: 54px; flex-direction: row; order: 2; border-right: 0; border-top: 1px solid var(--border); padding: 0 6px; position: fixed; bottom: 0; left: 0; right: 0; z-index: var(--z-sticky); }
  .sidebar-brand { display: none; }
  .sidebar-nav { flex-direction: row; flex: 1; justify-content: space-around; }
  .nav-btn { width: 52px; height: 44px; }
  .nav-btn.active::before { left: 50%; top: -1px; translate: -50% 0; width: 20px; height: 2px; }
  .sidebar-foot { margin-top: 0; }
  .workspace { height: calc(100vh - 54px); }
  .ws-head { padding: 14px 16px 8px; flex-direction: column; align-items: flex-start; }
  .ws-subnav { padding: 6px 16px; overflow-x: auto; }
  .ws-body { padding: 14px 16px 80px; }
  .filters-bar { padding: 6px 16px; }
  .sheet { width: 100vw; border-left: 0; border-top: 1px solid var(--border); top: auto; height: 85vh; border-radius: var(--r-sheet) var(--r-sheet) 0 0; transform: translateY(100%); }
  .sheet.open { transform: none; }
  .queue-card { flex-wrap: wrap; }
  .q-actions { width: 100%; justify-content: flex-end; margin-top: 4px; }
  .queue-stats { grid-template-columns: repeat(2, 1fr); }
  .fab { right: 16px; bottom: 68px; }
  .batch-bar.open { bottom: 68px; }
  .toast-stack { bottom: 68px; right: 12px; left: 12px; }
  .kbd-table { grid-template-columns: 1fr; }
  h1 { font-size: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}

/* ===== Activity Feed ===== */
.activity-feed { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: var(--r-card); overflow: hidden; }
.activity-entry { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12.5px; }
.activity-entry:last-child { border-bottom: 0; }
.activity-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.activity-dot.activity-kind-feedback { background: #f59e0b; }
.activity-dot.activity-kind-tree_change { background: var(--accent); }
.activity-dot.activity-kind-pattern { background: #22c55e; }
.activity-dot.activity-kind-note { background: var(--ink-3); }
.activity-dot.activity-kind-system { background: var(--ink-3); opacity: 0.5; }
.activity-time { font-family: var(--font-mono); font-size: 10px; color: var(--ink-3); min-width: 32px; }
.activity-kind { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; }
.activity-kind.activity-kind-feedback { background: color-mix(in oklch, #f59e0b 15%, transparent); color: #f59e0b; }
.activity-kind.activity-kind-tree_change { background: var(--accent-tint); color: var(--accent); }
.activity-kind.activity-kind-pattern { background: color-mix(in oklch, #22c55e 15%, transparent); color: #22c55e; }
.activity-kind.activity-kind-note { background: var(--elevated); color: var(--ink-2); }
.activity-kind.activity-kind-system { background: var(--elevated); color: var(--ink-3); }
.activity-summary { flex: 1; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activity-details { padding: 8px 12px; background: var(--bg); font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }
.activity-toggle { flex-shrink: 0; }

/* ===== Topic Filter ===== */
.topic-filter-bar { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 12px; color: var(--ink-2); }
.topic-filter-label { font-weight: 500; color: var(--ink-3); }
.topic-filter-active { background: var(--accent-tint) !important; color: var(--accent) !important; border-color: transparent !important; }

/* ===== Week Summary ===== */
.week-summary { display: flex; gap: 16px; padding: 10px 0; font-size: 12px; color: var(--ink-2); border-top: 1px solid var(--border); margin-top: 8px; }
.week-summary-label { font-weight: 600; color: var(--ink); margin-right: 4px; }

/* ===== Recent Vault ===== */
.vault-recent { margin-top: 8px; }
.vault-recent .sec-title { margin-top: 0; margin-bottom: 8px; }

/* ===== Heatmap Controls ===== */
.heatmap-controls { display: flex; gap: 4px; margin-bottom: 8px; }

/* ===== Heatmap Legend ===== */
.heatmap-legend { display: flex; align-items: center; gap: 3px; margin-top: 8px; font-size: 10px; color: var(--ink-3); }
.heatmap-legend span { display: inline-block; }
.hm-legend-cell { width: 11px; height: 11px; border-radius: 2px; background: var(--elevated); display: inline-block; }
.hm-legend-cell.l1 { background: color-mix(in oklch, var(--consumed) 25%, var(--elevated)); }
.hm-legend-cell.l2 { background: color-mix(in oklch, var(--consumed) 48%, var(--elevated)); }
.hm-legend-cell.l3 { background: color-mix(in oklch, var(--consumed) 70%, var(--elevated)); }
.hm-legend-cell.l4 { background: var(--consumed); }

/* ===== Trend Cards ===== */
.trend-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 14px 18px; margin-bottom: 12px; }
.trend-card .chart-title { margin-bottom: 10px; }
.trend-row { display: flex; gap: 24px; }
.trend-stat { display: flex; flex-direction: column; gap: 2px; }
.trend-label { font-size: 11px; color: var(--ink-3); }
.trend-value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
.trend-value.c-consumed { color: var(--consumed); }
.trend-value.c-rejected { color: var(--rejected); }

/* ===== Responsive ===== */
@media (max-width: 720px) {
  .trend-row { gap: 12px; flex-wrap: wrap; }
  .trend-stat { min-width: 60px; }
  .activity-entry { flex-wrap: wrap; gap: 4px; }
  .heatmap-legend { gap: 2px; }
}
/* ===== Today's pick (single-focus) ===== */
.todays-pick { border:1px solid var(--accent); border-radius:12px; padding:20px; margin-bottom:20px; background: color-mix(in oklch, var(--accent) 8%, var(--surface)); }
.tp-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--accent); margin-bottom:8px; }
.tp-title { font-size:17px; font-weight:600; color:var(--ink); text-decoration:none; }
.tp-title:hover { text-decoration:underline; }
.tp-sub { font-size:13px; color:var(--ink-2); margin-top:3px; }
.tp-why { font-size:13px; color:var(--ink-2); margin-top:6px; line-height:1.4; }
.tp-actions { margin-top:14px; display:flex; align-items:center; gap:12px; }
.tp-more { font-size:12px; color:var(--ink-2); }

/* ===== Field hint ===== */
.field-hint { font-size:11px; color:var(--ink-2); margin:-6px 0 10px; }

/* ===== Score slider ===== */
.score-val { font-size:13px; font-weight:600; min-width:36px; color:var(--ink-2); }

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
  ws: 'curate', sub: { curate: 'queue', map: 'canvas', log: 'journal', vault: 'files' },
  recs: [], recsTotal: 0,
  brain: { profile: null, tree: null, health: null },
  learning: [],
  vault: [],
  vaultView: 'list',
  stats: null,
  updateLog: [],
  search: '',
  queueSort: 'priority',
  queueDensity: 'card',
  loaded: { recs: false, brain: false, learning: false, vault: false, stats: false, updateLog: false },
  selection: new Set(),
  filters: { content_type: new Set(), rating: new Set(), since: null, has_why: false, creator: '' },
  focusedRow: 0,
  paletteOpen: false,
  paletteHi: 0,
  keySeq: null,
  resurfaceCount: 0,
  branchSort: 'recency',
  topicFilter: '',
  heatmapRange: '1Y',
};
// ---------- queue drag reorder ----------
const QUEUE_ORDER_KEY = 'tm-queue-order';
function getQueueOrder() { try { return JSON.parse(localStorage.getItem(QUEUE_ORDER_KEY) || '[]'); } catch { return []; } }
function saveQueueOrder(ids) { localStorage.setItem(QUEUE_ORDER_KEY, JSON.stringify(ids)); }
function applyQueueOrder(items) {
  const order = getQueueOrder();
  if (!order.length) return items;
  const byId = {};
  items.forEach(r => { byId[r.id] = r; });
  const ordered = [];
  order.forEach(id => { if (byId[id]) { ordered.push(byId[id]); delete byId[id]; } });
  Object.values(byId).forEach(r => ordered.push(r));
  return ordered;
}


const WS = {
  curate: {
    name: 'Curate', sub: 'Videos, articles, and books waiting for your review',
    views: [['queue', 'Queue'], ['archive', 'Archive'], ['bundles', 'Bundles'], ['all', 'All'], ['resurfacing', 'Resurface'], ['tensions', 'Tensions']],
  },
  map: {
    name: 'Map', sub: 'What you know, mapped',
    views: [['canvas', 'Canvas'], ['branches', 'Branches'], ['radar', 'Radar'], ['profile', 'Profile']],
  },
  log: {
    name: 'Log', sub: 'What you did and produced',
    views: [['journal', 'Journal'], ['stats', 'Stats']],
  },
  vault: {
    name: 'Vault', sub: 'Your HTML files and PDFs',
    views: [['files', 'Files']],
  },
};

// ---------- data fetching ----------
async function loadRecs() {
  try {
    const j = await api('/recommendations/list?limit=200');
    state.recs = j.recommendations || [];
    state.recsTotal = j.total || state.recs.length;
  } catch (e) {
    console.warn('recs load failed', e);
    state.recs = [];
    state.recsTotal = 0;
    toast('Failed to load recommendations: ' + e.message, true);
  }
  state.loaded.recs = true;
}
async function loadBrain() {
  try {
    var results = await Promise.allSettled([
      api('/brain/profile'), api('/brain/tree'), api('/brain/health'),
    ]);
    var p = results[0].status === 'fulfilled' ? results[0].value : null;
    var t = results[1].status === 'fulfilled' ? results[1].value : null;
    var h = results[2].status === 'fulfilled' ? results[2].value : null;
    state.brain = { profile: p, tree: t, health: h };
    if (!p && !t) console.warn('brain load failed: all requests rejected');
  } catch (e) { console.warn('brain load failed', e); }
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
  const badge = document.getElementById('nav-badge-vault');
  if (badge) {
    const count = state.vault.length;
    if (count > 0) { badge.hidden = false; badge.textContent = count > 99 ? '99+' : String(count); }
    else { badge.hidden = true; }
  }
}
async function loadStats() {
  try { state.stats = await api('/stats'); } catch { }
  state.loaded.stats = true;
}
async function loadUpdateLog() {
  try { const j = await api('/learning/update-log?limit=30'); state.updateLog = j.events || []; } catch { state.updateLog = []; }
  state.loaded.updateLog = true;
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
  document.getElementById('workspace').classList.toggle('workspace-vault', ws === 'vault');
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

  if (state.ws === 'curate') {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:auto';

    const sortSel = document.createElement('select');
    sortSel.className = 'fs-select';
    sortSel.style.height = '32px';
    sortSel.innerHTML = '<option value="priority">Sort: Priority</option><option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option><option value="type">Sort: Type</option>';
    sortSel.value = state.queueSort || 'priority';
    sortSel.onchange = () => { state.queueSort = sortSel.value; renderBody(); };

    const densBtn = document.createElement('button');
    densBtn.className = 'btn btn-ghost btn-icon';
    densBtn.title = state.queueDensity === 'compact' ? 'Switch to Card view' : 'Switch to Compact view';
    densBtn.innerHTML = state.queueDensity === 'compact'
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    densBtn.onclick = () => {
      state.queueDensity = state.queueDensity === 'compact' ? 'card' : 'compact';
      renderSubnav();
      renderBody();
    };

    const inp = document.createElement('input');
    inp.className = 'input'; inp.placeholder = 'Filter queue\u2026';
    inp.style.cssText = 'max-width:180px;height:32px';
    inp.value = state.search;
    inp.oninput = () => { state.search = inp.value; renderBody(); };

    wrap.append(sortSel, densBtn, inp);
    nav.appendChild(wrap);
  } else if (state.ws === 'map' && state.sub.map !== 'profile') {
    const inp = document.createElement('input');
    inp.className = 'input'; inp.placeholder = 'Filter\u2026';
    inp.style.cssText = 'max-width:220px;height:32px;margin-left:auto';
    inp.value = state.search;
    inp.oninput = () => { state.search = inp.value; renderBody(); };
    nav.appendChild(inp);
  } else if (state.ws === 'vault') {
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
  if (view === 'resurfacing') return ' <span class="seg-count">' + (state.resurfaceCount || 0) + '</span>';
  if (view === 'tensions') return ' <span class="seg-count">' + (state.brain?.health?.contradictionsCount || 0) + '</span>';
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
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn'; refreshBtn.id = 'act-refresh';
    refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>Refresh';
    refreshBtn.onclick = () => { refresh(true); };
    const neu = document.createElement('button');
    neu.className = 'btn btn-primary'; neu.id = 'act-new';
    neu.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>New entry';
    neu.onclick = openPushSheet;
    a.append(refreshBtn, neu);
  } else if (state.ws === 'vault') {
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
    'curate.queue': ['recs'], 'curate.archive': ['recs'], 'curate.all': ['recs'], 'curate.resurfacing': ['brain'], 'curate.tensions': ['brain'],
    'map.canvas': ['brain'], 'map.branches': ['brain'], 'map.profile': ['brain'], 'map.resurfacing': ['brain'], 'map.radar': ['brain', 'recs'], 'map.tensions': ['brain'], 'map.mega': ['brain'],
    'log.journal': ['learning', 'recs', 'vault'], 'log.stats': ['stats'],
    'vault.files': ['vault'],
  }[key] || [];
  const missing = needsData.filter(d => !state.loaded[d]);
  if (missing.length) {
    body.innerHTML = '<div class="loading-skeleton"><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>';
    return;
  }
  VIEWS[key](body);
  renderFiltersBar();
}

// ---------- focus trap (sheets / modals / palette) ----------
let _prevFocus = null;
let _trapEl = null;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function trapFocus(el) {
  _prevFocus = document.activeElement;
  _trapEl = el;
  const nodes = $$(FOCUSABLE, el);
  if (nodes[0]) setTimeout(() => nodes[0].focus(), 30);
}
function releaseFocus() {
  _trapEl = null;
  if (_prevFocus && typeof _prevFocus.focus === 'function') {
    try { _prevFocus.focus(); } catch {}
  }
  _prevFocus = null;
}
document.addEventListener('keydown', (e) => {
  if (!_trapEl || e.key !== 'Tab') return;
  const nodes = $$(FOCUSABLE, _trapEl).filter(n => n.offsetParent !== null || n === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ---------- sheet / modal ----------
function openSheet(title, bodyEl, footEl) {
  const sheet = $('#sheet');
  sheet.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'sheet-head';
  head.innerHTML = '<h2>' + esc(title) + '</h2>';
  const close = document.createElement('button');
  close.className = 'btn btn-ghost btn-icon';
  close.setAttribute('aria-label', 'Close');
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
  document.getElementById('workspace')?.setAttribute('inert', '');
  trapFocus(sheet);
}
function closeSheet() {
  document.getElementById('workspace')?.removeAttribute('inert');
  $('#sheet-backdrop').classList.remove('open');
  $('#sheet').classList.remove('open');
  if (_trapEl === $('#sheet')) releaseFocus();
}
$('#sheet-backdrop').onclick = closeSheet;

function openModal(contentEl, wide) {
  const m = $('#modal');
  m.className = 'modal' + (wide ? ' modal-wide' : '');
  m.innerHTML = '';
  m.appendChild(contentEl);
  $('#modal-backdrop').classList.add('open');
  document.getElementById('workspace')?.setAttribute('inert', '');
  trapFocus(m);
}
function closeModal() {
  document.getElementById('workspace')?.removeAttribute('inert');
  $('#modal-backdrop').classList.remove('open');
  if (_trapEl === $('#modal')) releaseFocus();
}
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
  const dedup = input({ placeholder: 'stable-key (optional \u2014 auto from URL)' });
  const dedupHint = document.createElement('div');
  dedupHint.className = 'field-hint';
  const updDedup = () => {
    const u = url.value.trim();
    const m = u.match(/(?:youtu\\.be[/]|v=)([\\w-]{6,})/) || u.match(/amazon\\.[a-z.]+[/](?:dp|gp[/]product|product)[/]([A-Z0-9]{8,})/i) || u.match(/isbn[:=]?(\\d{10,13})/i);
    dedupHint.textContent = m ? 'Auto key: ' + (m[1].startsWith('http') ? 'yt_' : (u.includes('amazon') || u.includes('isbn') ? 'book_' : '')) + m[1] : 'Tip: paste a YouTube/Amazon/ISBN URL to auto-lock a stable key.';
  };
  const bundle = input({ placeholder: 'synergy bundle (optional)' });
  body.append(
    field('Title', title),
    field('Creator', creator),
    field('URL', url),
    field('Type', type),
    field('Why this?', why),
    field('Dedup key', dedup),
    dedupHint,
    field('Synergy bundle', bundle),
  );
  const aiWhy = document.createElement('button');
  aiWhy.className = 'btn btn-sm btn-ghost';
  aiWhy.textContent = '\u2728 AI suggest why';
  aiWhy.onclick = async () => {
    aiWhy.disabled = true; aiWhy.textContent = 'Thinking\u2026';
    try {
      const j = await api('/ai/enhance/why', { method: 'POST', body: JSON.stringify({ video_title: title.value, creator: creator.value, content_type: type.value }) });
      if (j.text) why.value = j.text;
    } catch { toast('AI failed', true); }
    aiWhy.disabled = false; aiWhy.textContent = '\u2728 AI suggest why';
  };
  body.append(aiWhy);
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
  url.addEventListener('blur', async () => {
    checkBl(); updDedup();
    const u = url.value.trim();
    const ytMatch = u.match(/(?:youtu.be/|(?:v|embed|shorts)/|watch?v=)([w-]{11})/);
    if (ytMatch && !title.value.trim()) {
      try {
        const j = await api('/api/yt/' + ytMatch[1]);
        if (j.title) { title.value = j.title; if (j.creator) creator.value = j.creator; }
      } catch {}
    }
  });
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

  // Rating enum
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

  // Numeric score 0-10 (data quality: dual scale, normalized server-side)
  const scoreWrap = document.createElement('div');
  scoreWrap.style.cssText = 'display:flex;align-items:center;gap:12px;margin:4px 0 2px';
  const score = document.createElement('input');
  score.type = 'range'; score.min = '0'; score.max = '10'; score.step = '1';
  score.value = item.user_score != null ? String(item.user_score) : (rating ? String({ love: 9, like: 7, meh: 5, dislike: 2 }[rating] || '0') : '0');
  const scoreVal = document.createElement('span');
  scoreVal.className = 'score-val';
  scoreVal.textContent = score.value + '/10';
  score.oninput = () => { scoreVal.textContent = score.value + '/10'; };
  scoreWrap.appendChild(score); scoreWrap.appendChild(scoreVal);
  body.appendChild(field('Score', scoreWrap));

  // Review notes (mandatory on consume)
  const notes = textarea({ placeholder: 'Takeaways, reflections, quotes\u2026 (required to mark consumed)' });
  notes.value = item.user_review || '';
  const noteHint = document.createElement('div');
  noteHint.className = 'field-hint';
  noteHint.textContent = targetStatus === 'consumed' ? 'A review is required (1 sentence min).' : 'Optional.';
  body.appendChild(field('Review', notes));
  body.appendChild(noteHint);

  // AI enhance button (sharpen the existing review text)
  const enhBtn = document.createElement('button');
  enhBtn.className = 'btn btn-ghost';
  enhBtn.type = 'button';
  enhBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l1.9 4.8L19 9.2l-4.1 2.9L16 17l-4-2.8L8 17l1.1-4.9L5 9.2l5.1-1.4z"/></svg> AI enhance';
  enhBtn.onclick = async () => {
    setLoading(enhBtn, true);
    try {
      const j = await api('/ai/enhance', { method: 'POST', body: JSON.stringify({ id: item.id, text: notes.value.trim() || undefined }) });
      if (j.text) { notes.value = j.text; toast('Enhanced (' + (j.source || 'local') + ')'); }
    } catch (e) { toast('Enhance failed: ' + e.message, true); }
    finally { setLoading(enhBtn, false); }
  };
  body.appendChild(enhBtn);

  const foot = document.createElement('div');
  foot.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.textContent = targetStatus === 'consumed' ? 'Mark consumed' : targetStatus === 'rejected' ? 'Reject' : 'Save';
  save.onclick = async () => {
    const review = notes.value.trim();
    if (targetStatus === 'consumed' && review.length < 3) {
      noteHint.style.color = 'var(--rejected)';
      noteHint.textContent = 'Required: write at least one sentence before marking consumed.';
      notes.focus();
      return toast('Review required to consume', true);
    }
    setLoading(save, true);
    try {
      await api('/recommendations/action', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id, status: targetStatus,
          user_rating: rating || 'unset', user_score: Number(score.value),
          user_review: review,
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
  document.getElementById('workspace')?.setAttribute('inert', '');
  body.innerHTML = '<div class="palette-empty">Type to search recs, brain nodes, vault files, and patterns</div>';
  trapFocus(document.getElementById('palette'));
  setTimeout(() => { input.value = ''; input.focus(); }, 20);
  let lastResults = { groups: { recs: [], nodes: [], vault: [], patterns: [] } };
  let timer;
  const close = () => {
    state.paletteOpen = false;
    backdrop.classList.remove('open');
    input.value = '';
    if (_trapEl === document.getElementById('palette')) releaseFocus();
  };
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
      if (q.length < 2) { body.innerHTML = '<div class="palette-empty">Type to search recs, brain nodes, vault files, and patterns</div>'; lastResults = { groups: { recs: [], nodes: [], vault: [], patterns: [] } }; return; }
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
        else if (kind === 'vault') { setWorkspace('vault', 'files'); }
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
  document.getElementById('workspace')?.removeAttribute('inert');
  const bd = document.getElementById('palette-backdrop');
  if (bd) bd.classList.remove('open');
  const input = document.getElementById('palette-input');
  if (input) input.value = '';
  if (_trapEl === document.getElementById('palette')) releaseFocus();
}

// ---------- keymap overlay (feature 4) ----------
const KEYS = [
  { keys: ['\u2318 K', 'Ctrl K'], desc: 'Open command palette' },
  { keys: ['?'], desc: 'Show this overlay' },
  { keys: ['g c', 'g m', 'g l'], desc: 'Go to Curate / Map / Log' },
  { keys: ['g v'], desc: 'Go to Vault' },
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
function initFiltersBar() {
  const bar = document.getElementById('filters-bar');
  if (!bar) return;
  bar.addEventListener('change', onFilterChange);
  bar.addEventListener('click', onFilterClick);
  bar.addEventListener('input', onFilterInput);
}
let _fd;
function debouncedRender() { clearTimeout(_fd); _fd = setTimeout(renderBody, 120); }
function onFilterChange(e) {
  const sel = e.target.closest('[data-f]');
  if (!sel) return;
  const f = sel.dataset.f;
  if (f === 'type') { state.filters.content_type.clear(); if (sel.value) state.filters.content_type.add(sel.value); }
  else if (f === 'rating') { state.filters.rating.clear(); if (sel.value) state.filters.rating.add(sel.value); }
  renderBody();
}
function onFilterClick(e) {
  const c = e.target.closest('[data-f]');
  if (!c || c.tagName === 'SELECT') return;
  const f = c.dataset.f;
  if (f === 'since') { state.filters.since = state.filters.since ? null : new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]; }
  else if (f === 'why') { state.filters.has_why = !state.filters.has_why; }
  else if (f === 'reset') { state.filters = { content_type: new Set(), rating: new Set(), since: null, has_why: false, creator: '' }; state.search = ''; }
  renderBody();
}
function onFilterInput(e) {
  const inp = e.target.closest('[data-f]');
  if (!inp) return;
  if (inp.dataset.f === 'search') { state.search = inp.value; debouncedRender(); }
  else if (inp.dataset.f === 'creator') { state.filters.creator = inp.value; debouncedRender(); }
}
function renderFiltersBar() {
  const bar = document.getElementById('filters-bar');
  if (!bar) return;
  if (state.ws !== 'curate') { bar.hidden = true; return; }
  bar.hidden = false;
  const anyOn = state.filters.content_type.size || state.filters.rating.size || state.filters.since || state.filters.has_why || state.filters.creator;
  let html = '';
  html += '<div class="fs-group"><span class="fs-label">Type</span><select class="fs-select" data-f="type">';
  html += '<option value="">All types</option>';
  CONTENT_TYPES.forEach(t => {
    const on = state.filters.content_type.has(t);
    html += '<option value="' + esc(t) + '"' + (on ? ' selected' : '') + '>' + esc(t) + '</option>';
  });
  html += '</select></div>';
  html += '<div class="fs-group"><span class="fs-label">Rating</span><select class="fs-select" data-f="rating">';
  html += '<option value="">All ratings</option>';
  RATINGS.forEach(r => {
    const on = state.filters.rating.has(r);
    html += '<option value="' + esc(r) + '"' + (on ? ' selected' : '') + '>' + esc(r) + '</option>';
  });
  html += '</select></div>';
  html += '<span class="fs-toggle ' + (state.filters.since ? 'on' : '') + '" data-f="since"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Last 7d</span>';
  html += '<span class="fs-toggle ' + (state.filters.has_why ? 'on' : '') + '" data-f="why"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>Notes</span>';
  html += '<div class="fs-input-wrap"><svg class="fs-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input class="fs-input" data-f="search" placeholder="Filter\u2026" value="' + esc(state.search) + '" /></div>';
  html += '<input class="fs-input" data-f="creator" placeholder="Creator\u2026" value="' + esc(state.filters.creator) + '" style="min-width:100px" />';
  if (anyOn) html += '<span class="fs-toggle on" data-f="reset" style="color:var(--rejected)">Clear</span>';
  bar.innerHTML = html;
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
      '<div class="e-title">Queue is clear</div><div style="margin-bottom:12px">Nothing waiting for review. Push something new or let the curator pipeline refill it.</div>' +
      '<div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-primary" onclick="window.__new()">New entry</button>' +
      '<button class="btn btn-ghost" onclick="window.__refill()">Refill pipeline</button></div></div>';
    window.__new = openPushSheet;
    window.__refill = async () => {
      try { toast('Refill requested...'); await loadRecs(); renderBody(); } catch (e) { toast('Refill failed: ' + e.message, true); }
    };
    return;
  }

  // Single-focus "today's pick"
  if (items.length) {
    const pick = (applyQueueOrder(items.slice())[0]) || items[0];
    const pc = document.createElement('div');
    pc.className = 'todays-pick';
    pc.innerHTML =
      '<div class="tp-label">Today\\'s pick</div>' +
      '<a class="tp-title" href="' + esc(pick.video_url) + '" target="_blank" rel="noopener">' + esc(pick.video_title) + '</a>' +
      (pick.creator ? '<div class="tp-sub">' + esc(pick.creator) + '</div>' : '') +
      (pick.why_this ? '<div class="tp-why">' + esc(pick.why_this) + '</div>' : '');
    const tpActs = document.createElement('div');
    tpActs.className = 'tp-actions';
    const tpTake = document.createElement('button');
    tpTake.className = 'btn btn-primary';
    tpTake.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Review now';
    tpTake.onclick = () => openReviewSheet(pick, 'consumed');
    tpActs.appendChild(tpTake);
    if (items.length > 1) {
      const tpMore = document.createElement('span');
      tpMore.className = 'tp-more';
      tpMore.textContent = (items.length - 1) + ' more in queue below';
      tpActs.appendChild(tpMore);
    }
    pc.appendChild(tpActs);
    body.appendChild(pc);
  }

  // Dashboard section above queue cards
  const dash = document.createElement("div");
  dash.className = "queue-dashboard";

  // Stat cards
  const now = Date.now();
  const dayDiff = (d) => { if (!d || d === "unset") return 999; return Math.floor((now - new Date(d).getTime()) / 86400000); };
  const curMonth = new Date().toISOString().slice(0, 7);
  const total = state.recs.length;
  const waiting = items.length;
  const monthItems = items.filter(r => r.created_at && r.created_at.startsWith(curMonth)).length;
  const stale = items.filter(r => r.verified && dayDiff(r.verified) > 7).length;

  const stats = document.createElement("div");
  stats.className = "queue-stats";
  const statDefs = [
    { val: waiting, label: "Waiting", cls: waiting > 0 ? "c-active" : "" },
    { val: total, label: "Total entries", cls: "" },
    { val: monthItems, label: "This month", cls: monthItems > 0 ? "c-consumed" : "" },
    { val: stale, label: "Stale", cls: stale > 0 ? "c-rejected" : "" },
  ];
  statDefs.forEach(s => {
    const b = document.createElement("div");
    b.className = "queue-stat";
    b.innerHTML = '<div class="qs-val ' + s.cls + '">' + s.val + '</div><div class="qs-label">' + s.label + '</div>';
    stats.appendChild(b);
  });
  dash.appendChild(stats);

  // Content type chips
  const typeCounts = {};
  items.forEach(r => { const t = r.content_type || "other"; typeCounts[t] = (typeCounts[t] || 0) + 1; });
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length) {
    const chips = document.createElement("div");
    chips.className = "queue-types";
    sorted.forEach(([t, c]) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = t + " \xD7" + c;
      chips.appendChild(chip);
    });
    dash.appendChild(chips);
  }

  // Stale banner (items > 14 days)
  const oldItems = items.filter(r => r.verified && dayDiff(r.verified) > 14);
  if (oldItems.length) {
    const banner = document.createElement("div");
    banner.className = "queue-stale-banner";
    banner.innerHTML = '<strong>' + oldItems.length + ' item' + (oldItems.length > 1 ? "s" : "") + '</strong> waiting 14+ days \u2014 consider reviewing or rejecting.';
    dash.appendChild(banner);
  }

  body.appendChild(dash);

  // Apply sorting options
  if (state.queueSort === 'newest') {
    items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  } else if (state.queueSort === 'oldest') {
    items.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  } else if (state.queueSort === 'type') {
    items.sort((a, b) => (a.content_type || '').localeCompare(b.content_type || ''));
  } else {
    items = applyQueueOrder(items);
  }

  const wrap = document.createElement('div');
  wrap.className = 'queue-cards' + (state.queueDensity === 'compact' ? ' density-compact' : '');
  items.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'qc-card';
    card.dataset.fid = r.id;
    card.style.animation = 'rise 200ms ease backwards';
    card.style.animationDelay = Math.min(i * 30, 300) + 'ms';
    card.draggable = true;
    card.ondragstart = (e) => { e.dataTransfer.setData('text/plain', r.id); card.classList.add('dragging'); };
    card.ondragend = () => card.classList.remove('dragging');
    card.ondragover = (e) => { e.preventDefault(); card.classList.add('drag-over'); };
    card.ondragleave = () => card.classList.remove('drag-over');
    card.ondrop = (e) => { e.preventDefault(); card.classList.remove('drag-over'); const fromId = e.dataTransfer.getData('text/plain'); if (!fromId || fromId === r.id) return; const cards = [...wrap.children]; const fromIdx = cards.findIndex(c => c.dataset.fid === fromId); const toIdx = cards.findIndex(c => c.dataset.fid === r.id); if (fromIdx < 0 || toIdx < 0) return; const moved = cards[fromIdx]; wrap.insertBefore(moved, fromIdx < toIdx ? card.nextSibling : card); const newOrder = [...wrap.children].map(c => c.dataset.fid); saveQueueOrder(newOrder); };

    // Mobile touch swipe gestures
    let touchStartX = 0;
    card.ontouchstart = (e) => { touchStartX = e.touches[0].clientX; };
    card.ontouchmove = (e) => {
      const dx = e.touches[0].clientX - touchStartX;
      if (dx > 40) { card.classList.add('swiping-right'); card.classList.remove('swiping-left'); }
      else if (dx < -40) { card.classList.add('swiping-left'); card.classList.remove('swiping-right'); }
      else { card.classList.remove('swiping-right', 'swiping-left'); }
    };
    card.ontouchend = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      card.classList.remove('swiping-right', 'swiping-left');
      if (dx > 90) { openReviewSheet(r, 'consumed'); }
      else if (dx < -90) {
        api('/recommendations/action', { method: 'POST', body: JSON.stringify({ id: r.id, status: 'rejected' }) })
          .then(() => {
            toastUndo('Rejected 1 item', async () => {
              await api('/recommendations/action', { method: 'POST', body: JSON.stringify({ id: r.id, status: 'active' }) });
              await loadRecs(); renderBody();
            });
            loadRecs().then(() => renderBody());
          });
      }
    };

    // Row 1: checkbox + dot + body + meta
    const row1 = document.createElement('div');
    row1.className = 'qc-row1';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'chk';
    cb.checked = state.selection.has(r.id);
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => toggleSelect(r.id, cb.checked);
    const dot = document.createElement('span'); dot.className = 'qc-dot dot-active';
    const bodyEl = document.createElement('div'); bodyEl.className = 'qc-body';
    const title = document.createElement('a'); title.className = 'qc-title'; title.href = r.video_url; title.target = '_blank'; title.rel = 'noopener'; title.textContent = r.video_title;
    const sub = document.createElement('div'); sub.className = 'qc-sub'; sub.textContent = r.creator || '';
    bodyEl.append(title, sub);

    const meta = document.createElement('div'); meta.className = 'qc-meta';
    if (r.content_type) {
      const typeEl = document.createElement('span'); typeEl.className = 'qc-type'; typeEl.textContent = r.content_type;
      typeEl.setAttribute('aria-label', 'Type: ' + r.content_type);
      typeEl.title = 'Type: ' + r.content_type;
      meta.appendChild(typeEl);
    }
    if (r.synergy_bundle_id && r.synergy_bundle_id !== 'unset') {
      const bundleEl = document.createElement('span'); bundleEl.className = 'qc-bundle'; bundleEl.textContent = '\u{1F4E6} ' + r.synergy_bundle_id;
      meta.appendChild(bundleEl);
    }
    if (r.dedup_key && r.dedup_key.includes('-')) {
      const branch = r.dedup_key.split('-')[0];
      if (branch && !['yt', 'book', 'key', 'rec', 'html'].includes(branch)) {
        const brEl = document.createElement('span'); brEl.className = 'qc-branch'; brEl.textContent = '\u{1F33F} ' + branch;
        meta.appendChild(brEl);
      }
    }
    const ageEl = document.createElement('span'); ageEl.className = 'qc-age'; ageEl.textContent = age(r.verified) ? age(r.verified) + ' ago' : '';
    meta.appendChild(ageEl);
    row1.append(cb, dot, bodyEl, meta);
    card.appendChild(row1);

    // Description
    if (r.why_this) {
      const desc = document.createElement('div'); desc.className = 'qc-desc'; desc.textContent = r.why_this;
      card.appendChild(desc);
    }

    // Actions
    const acts = document.createElement('div'); acts.className = 'qc-actions';
    const take = document.createElement('button');
    take.className = 'btn btn-primary';
    take.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Mark done';
    take.onclick = () => openReviewSheet(r, 'consumed');
    const reject = document.createElement('button');
    reject.className = 'btn btn-ghost btn-danger';
    reject.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Reject';
    reject.onclick = async () => {
      try {
        await api('/recommendations/action', { method: 'POST', body: JSON.stringify({ id: r.id, status: 'rejected' }) });
        toastUndo('Rejected 1 item', async () => {
          await api('/recommendations/action', { method: 'POST', body: JSON.stringify({ id: r.id, status: 'active' }) });
          await loadRecs(); renderBody();
        });
        await loadRecs(); renderBody();
      } catch (e) { toast('Reject failed: ' + e.message, true); }
    };
    acts.append(take, reject);
    card.appendChild(acts);
    wrap.appendChild(card);
  });
  body.appendChild(wrap);
};

VIEWS['curate.archive'] = (body) => {
  const q = state.search.toLowerCase();
  let items = state.recs.filter(r => r.status === 'consumed');
  items = applyFilters(items);
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
      ? '<span class="rating-tag rating-' + esc(r.user_rating) + '">' + esc(r.user_rating) + (r.user_score != null ? ' ' + r.user_score : '') + '</span>'
      : '';
    item.innerHTML =
      '<span class="dot dot-consumed" style="margin-top:6px"></span>' +
      '<div>' +
      '<div class="a-title"><a href="' + esc(r.video_url) + '" target="_blank" rel="noopener">' + esc(r.video_title) + '</a></div>' +
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
      '<div class="q-title"><a href="' + esc(r.video_url) + '" target="_blank" rel="noopener">' + esc(r.video_title) + '</a></div>' +
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

VIEWS['curate.tensions'] = async (body) => {
  try {
    const j = await api('/brain/contradictions');
    const list = j.contradictions || [];
    if (!list.length) {
      body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><div class="e-title">No tensions</div><div>Auto-detected contradictions appear here when you consume items with opposing signals in the same branch.</div></div>';
      return;
    }
    const wrap = document.createElement('div'); wrap.style.maxWidth = '880px';
    const t = document.createElement('div'); t.className = 'sec-title'; t.innerHTML = 'Unresolved contradictions <span class="count">' + list.length + '</span>';
    wrap.appendChild(t);
    list.forEach(c => {
      const el = document.createElement('div'); el.className = 'archive-item';
      el.innerHTML = '<span class="dot dot-rejected" style="margin-top:6px"></span>' +
        '<div><div class="a-title" style="font-size:13px">' + esc(c.topic) + '</div>' +
        '<div class="a-meta" style="font-size:12px">' + esc(c.tension || '') + '</div></div>' +
        '<div><button class="btn btn-sm btn-ghost btn-danger" data-cid="' + esc(c.id) + '">Resolve</button></div>';
      el.querySelector('[data-cid]').onclick = async () => {
        try { await api('/brain/contradiction/resolve', { method: 'POST', body: JSON.stringify({ id: c.id }) }); toast('Resolved'); renderBody(); }
        catch (e) { toast('Failed: ' + e.message, true); }
      };
      wrap.appendChild(el);
    });
    body.appendChild(wrap);
  } catch (e) {
    body.innerHTML = '<div class="empty"><div>Failed to load contradictions: ' + esc(e.message) + '</div></div>';
  }
};

VIEWS['curate.bundles'] = (body) => {
  const map = {};
  state.recs.filter(r => r.synergy_bundle_id && r.synergy_bundle_id !== 'unset').forEach(r => {
    const bid = r.synergy_bundle_id;
    if (!map[bid]) map[bid] = [];
    map[bid].push(r);
  });
  const bundleIds = Object.keys(map).sort();
  if (!bundleIds.length) {
    body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg><div class="e-title">No bundles yet</div><div>Group recs with a synergy_bundle_id to see learning paths here.</div></div>';
    return;
  }
  const wrap = document.createElement('div'); wrap.className = 'queue-grid';
  bundleIds.forEach(bid => {
    const items = map[bid];
    const done = items.filter(r => r.status === 'consumed').length;
    const card = document.createElement('div');
    card.className = 'qc-card';
    card.innerHTML =
      '<div class="qc-hd"><span class="qc-chip">&#128188; Bundle</span><span class="qc-bundle-label">' + esc(bid) + '</span></div>' +
      '<div class="qc-title" style="font-size:15px;margin-bottom:8px">' + items.length + ' items &middot; ' + done + ' completed</div>' +
      '<div class="qc-meta"><div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:' + Math.round(done / items.length * 100) + '%"></div></div></div>' +
      '<div style="margin-top:12px">' + items.slice(0, 5).map(r =>
        '<div style="font-size:12px;padding:2px 0;color:var(--ink-2)"><span class="dot dot-' + (r.status === 'consumed' ? 'consumed' : r.status === 'rejected' ? 'rejected' : 'active') + '" style="width:6px;height:6px;margin-right:6px"></span>' + esc(r.video_title.slice(0, 60)) + '</div>'
      ).join('') + (items.length > 5 ? '<div class="dim" style="font-size:11px;padding-top:4px">+' + (items.length - 5) + ' more</div>' : '') + '</div>';
    card.style.cursor = 'pointer';
    card.onclick = () => {
      state.search = bid;
      setWorkspace('curate', 'queue');
    };
    wrap.appendChild(card);
  });
  body.appendChild(wrap);
};

// ---------- MAP: canvas with expand/collapse tree (Cytoscape) ----------
VIEWS['map.canvas'] = (body) => {
  if (state._cc) { state._cc.forEach(function (f) { f(); }); state._cc = []; }
  if (typeof window.cytoscape === 'undefined') {
    body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><div class="e-title">Map unavailable</div><div>Graph library failed to load. Check your connection and reload.</div></div>';
    return;
  }
  var CY = window.cytoscape;
  var allNodes = (state.brain.tree && state.brain.tree.nodes) || [];
  if (!allNodes.length) {
    body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><div class="e-title">No knowledge tree</div><div>Seed the brain to populate the canvas.</div></div>';
    return;
  }

  var byId = {}; allNodes.forEach(function (n) { byId[n.id] = n; });
  // Data may reference parent_id 'root' without a root node present (e.g. live DB
  // differs from the seeded local one). Synthesize one so edges resolve and the
  // canvas initializes instead of throwing on a missing edge source.
  if (!byId['root']) {
    var vroot = { id: 'root', type: 'root', label: 'Me', status: null, super_category: null, parent_id: null };
    byId['root'] = vroot;
    allNodes = allNodes.concat([vroot]);
  }
  var childrenOf = {}; allNodes.forEach(function (n) { if (n.parent_id) { (childrenOf[n.parent_id] = childrenOf[n.parent_id] || []).push(n); } });
  var childCount = {}; allNodes.forEach(function (n) { if (n.parent_id) childCount[n.parent_id] = (childCount[n.parent_id] || 0) + 1; });
  var depthOf = {};
  function getDepth(n) {
    if (n.type === 'root') return 0;
    if (depthOf[n.id] !== undefined) return depthOf[n.id];
    var d = 0, cur = n, visited = {};
    while (cur && cur.parent_id && !visited[cur.id]) { visited[cur.id] = 1; d++; cur = byId[cur.parent_id]; if (d > 20) break; }
    depthOf[n.id] = d; return d;
  }
  allNodes.forEach(getDepth);
  var rootNodes = allNodes.filter(function (n) { return n.type === 'root'; });

  var catColors = {
    faith: 'oklch(78% 0.16 75)', mind: 'oklch(74% 0.14 195)', tools: 'oklch(76% 0.16 155)',
    body: 'oklch(73% 0.16 50)', money: 'oklch(82% 0.16 95)', life: 'oklch(74% 0.14 290)'
  };
  var catLabels = { faith: 'Faith', mind: 'Mind', tools: 'Tools', body: 'Body', money: 'Money', life: 'Life' };
  var catKeys = Object.keys(catColors);
  var masteryLevels = [
    { key: 'novice', label: 'Novice', radius: [130, 250] },
    { key: 'competent', label: 'Competent', radius: [260, 380] },
    { key: 'proficient', label: 'Proficient', radius: [390, 510] },
    { key: 'mastery', label: 'Mastery', radius: [520, 640] }
  ];
  function masteryOf(n) {
    if (n.type === 'root') return null;
    if (n.status === 'mastery') return 'mastery';
    var d = depthOf[n.id] || 3;
    if (d <= 1) return 'mastery';
    if (d === 2) return 'proficient';
    if (d === 3) return 'competent';
    return 'novice';
  }

  var W = 1280, H = 1280, PAD = 120, totalW = W + PAD * 2, totalH = H + PAD * 2;
  var cx = W / 2, cy = H / 2;
  var fullPos = {};
  var activeCats = [];

  function computeFull() {
    var byCat = {};
    allNodes.forEach(function (n) {
      if (n.type === 'root') return;
      var cat = (n.super_category || '').replace('cat-', '');
      if (!catKeys.includes(cat)) return;
      (byCat[cat] = byCat[cat] || []).push(n);
    });
    activeCats = catKeys.filter(function (c) { return byCat[c] && byCat[c].length; });
    var sectorCount = Math.max(activeCats.length, 1);
    var sectorSpan = (Math.PI * 2) / sectorCount;
    rootNodes.forEach(function (n, i) {
      var a = rootNodes.length === 1 ? 0 : (i / rootNodes.length) * Math.PI * 2;
      fullPos[n.id] = { x: cx + Math.cos(a) * 70, y: cy + Math.sin(a) * 70, r: 44 };
    });
    activeCats.forEach(function (cat, ci) {
      var sectorStart = ci * sectorSpan - Math.PI / 2;
      var list = byCat[cat];
      masteryLevels.forEach(function (lvl, li) {
        var inLevel = list.filter(function (n) { return masteryOf(n) === lvl.key; });
        if (!inLevel.length) return;
        inLevel.sort(function (a, b) { return (childCount[b.id] || 0) - (childCount[a.id] || 0); });
        inLevel.forEach(function (n, ni) {
          var a = sectorStart + sectorSpan * ((li + 0.5) / masteryLevels.length) + ((ni - inLevel.length / 2 + 0.5) / Math.max(inLevel.length, 1)) * (sectorSpan / masteryLevels.length) * 0.85;
          var radius = (lvl.radius[0] + lvl.radius[1]) / 2;
          fullPos[n.id] = { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, cat: catColors[cat], mastery: lvl.key };
        });
      });
    });
    var leftovers = allNodes.filter(function (n) { return n.type !== 'root' && !catKeys.includes((n.super_category || '').replace('cat-', '')); });
    leftovers.forEach(function (n, i) {
      var a = (i / Math.max(leftovers.length, 1)) * Math.PI * 2;
      fullPos[n.id] = { x: cx + Math.cos(a) * 260, y: cy + Math.sin(a) * 260, cat: null, mastery: 'novice' };
    });
    // collision relaxation
    function relaxCollisions() {
      var nodes = allNodes.map(function (n) { var p = fullPos[n.id]; return p ? p : { x: cx, y: cy, r: 30 }; });
      for (var iter = 0; iter < 80; iter++) {
        var alpha = Math.max(0.3, 1 - iter / 80);
        var moved = false;
        for (var i = 0; i < nodes.length; i++) {
          for (var j = i + 1; j < nodes.length; j++) {
            var a = nodes[i], b = nodes[j];
            var dx = b.x - a.x, dy = b.y - a.y;
            var dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            var minD = 98;
            if (dist < minD) {
              var overlap = minD - dist;
              var f = overlap * 0.5 * alpha;
              var fx = (dx / dist) * f, fy = (dy / dist) * f;
              if (allNodes[i].type !== 'root') { a.x -= fx; a.y -= fy; fullPos[allNodes[i].id].x = a.x; fullPos[allNodes[i].id].y = a.y; }
              if (allNodes[j].type !== 'root') { b.x += fx; b.y += fy; fullPos[allNodes[j].id].x = b.x; fullPos[allNodes[j].id].y = b.y; }
              moved = true;
            }
          }
        }
        if (!moved) break;
      }
    }
    relaxCollisions();
  }
  computeFull();

  // expanded state: root + r1 + r2
  var expanded = new Set();
  rootNodes.forEach(function (r) { expanded.add(r.id); });
  rootNodes.forEach(function (r) {
    (childrenOf[r.id] || []).forEach(function (c) {
      expanded.add(c.id);
      (childrenOf[c.id] || []).forEach(function (gc) { expanded.add(gc.id); });
    });
  });

  function isVis(n) {
    if (n.type === 'root') return true;
    if (!n.parent_id) return true;
    var p = byId[n.parent_id];
    if (!p) return true;
    return expanded.has(p.id) && isVis(p);
  }

  function tok(name, fb) { return (getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || fb; }

  function buildStyle() {
    var ink = tok('--ink', '#e8e8e8');
    var elevated = tok('--elevated', '#262626');
    var accent = tok('--accent', '#3dd6c6');
    var accentTint = ('color-mix(in oklch, ' + accent + ' 16%, transparent)');
    var borderS = tok('--border-strong', '#444');
    var ink3 = tok('--ink-3', '#666');
    var active = tok('--active', '#d8b');
    var consumed = tok('--consumed', '#cd9');
    var rejected = tok('--rejected', '#d55');
    function statusColor(ele) {
      var s = ele.data('status');
      if (s === 'active' || s === 'proficient') return active;
      if (s === 'consumed') return consumed;
      if (s === 'rejected') return rejected;
      return ink;
    }
    function borderColor(ele) {
      if (ele.data('isRoot')) return accent;
      var c = ele.data('cat');
      return catColors[c] || borderS;
    }
    function bgColor(ele) {
      if (ele.data('isRoot')) return ('color-mix(in oklch, ' + accent + ' 22%, ' + elevated + ')');
      var c = ele.data('cat');
      if (catColors[c]) return ('color-mix(in oklch, ' + catColors[c] + ' 12%, ' + elevated + ')');
      return elevated;
    }
    function labelColor(ele) {
      if (ele.data('isRoot')) return accent;
      var s = ele.data('status');
      if (s === 'active' || s === 'proficient') return active;
      if (s === 'consumed') return consumed;
      if (s === 'rejected') return rejected;
      return ink;
    }
    function borderWidth(ele) {
      if (ele.data('isRoot')) return 2.5;
      return catColors[ele.data('cat')] ? 1.8 : 1.2;
    }
    function nodeFont(ele) {
      if (ele.data('isRoot')) return 12;
      var d = ele.data('depth');
      return d <= 1 ? 12 : 11;
    }
    return [
      { selector: 'core', style: { 'active-bg-color': accent, 'active-bg-opacity': 0.15, 'selection-box-opacity': 0.15, 'selection-box-color': accent, 'outer-ring-color': accent, 'outer-ring-width': 2, 'box-selection-color': accent } },
      { selector: 'node', style: {
        'background-color': bgColor,
        'border-color': borderColor,
        'border-width': borderWidth,
        'color': labelColor,
        'font-family': 'Inter, system-ui, -apple-system, sans-serif', 'font-size': nodeFont, 'font-weight': 600,
        'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '130px',
        'shape': 'round-rectangle', 'width': 'label', 'height': 'label', 'padding': '6px 10px',
        'label': 'data(label)', 'min-zoomed-font-size': 0, 'opacity': 0.95, 'overlay-opacity': 0,
        'border-opacity': 0.85, 'text-outline-width': 0, 'transition-property': 'background-color, border-color, bounds, opacity',
        'transition-duration': '180ms'
      } },
      { selector: 'node[root]', style: { 'font-weight': 800, 'font-size': 13, 'text-transform': 'uppercase', 'letter-spacing': 1.5, 'min-zoomed-font-size': 0, 'border-style': 'double', 'border-width': 3, 'background-opacity': 1, 'padding': '10px 18px' } },
      { selector: 'node.dim', style: { 'opacity': 0.55 } },
      { selector: 'node.focused', style: { 'border-width': 2.5, 'border-color': accent, 'background-color': ('color-mix(in oklch, ' + accent + ' 20%, ' + elevated + ')'), 'opacity': 1, 'z-index': 99 } },
      { selector: 'edge', style: {
        'curve-style': 'unbundled-bezier', 'control-point-distances': [20], 'control-point-weights': [0.5],
        'width': 1.4, 'line-color': function (ele) { var t = ele.target(); var c = t.data('cat'); return catColors[c] || accent; },
        'line-opacity': 0.4, 'target-arrow-shape': 'none', 'z-index': 0
      } },
      { selector: 'edge.dim', style: { 'line-opacity': 0.10 } }
    ];
  }

  // ---- elements ----
  var elements = [];
  allNodes.forEach(function (n) {
    var p = fullPos[n.id] || { x: cx, y: cy };
    var isRoot = n.type === 'root' ? 1 : 0;
    elements.push({
      data: { id: n.id, label: n.label || n.id, type: n.type, status: n.status || '', cat: (n.super_category || '').replace('cat-', ''), mastery: masteryOf(n) || '', depth: depthOf[n.id] || 0, isRoot: isRoot, parent_id: n.parent_id || '' },
      position: { x: p.x, y: p.y },
      classes: isRoot ? 'root' : ''
    });
  });
  allNodes.forEach(function (n) {
    if (n.parent_id && byId[n.parent_id] && byId[n.id]) {
      elements.push({ data: { id: 'e_' + n.id, source: n.parent_id, target: n.id } });
    }
  });

  // ---- stage ----
  var SVGNS = 'http://www.w3.org/2000/svg';
  var stage = document.createElement('div');
  stage.className = 'canvas-stage canvas-stage--radial';

  var deco = document.createElementNS(SVGNS, 'svg');
  deco.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);
  deco.setAttribute('class', 'cy-deco');
  deco.style.width = totalW + 'px';
  deco.style.height = totalH + 'px';
  stage.appendChild(deco);

  var sectorCount = Math.max(activeCats.length, 1);
  var sectorSpan = (Math.PI * 2) / sectorCount;
  var innerR = 100, outerR = 820;

  var defs = document.createElementNS(SVGNS, 'defs');
  var radGrad = document.createElementNS(SVGNS, 'radialGradient');
  radGrad.setAttribute('id', 'cy-center-glow');
  radGrad.setAttribute('cx', '50%'); radGrad.setAttribute('cy', '50%'); radGrad.setAttribute('r', '50%');
  var stop1 = document.createElementNS(SVGNS, 'stop');
  stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', 'oklch(0.80 0.135 65)'); stop1.setAttribute('stop-opacity', '0.22');
  var stop2 = document.createElementNS(SVGNS, 'stop');
  stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', 'oklch(0.80 0.135 65)'); stop2.setAttribute('stop-opacity', '0');
  radGrad.appendChild(stop1); radGrad.appendChild(stop2); defs.appendChild(radGrad); deco.appendChild(defs);

  activeCats.forEach(function (cat, ci) {
    var a0 = ci * sectorSpan - Math.PI / 2;
    var a1 = a0 + sectorSpan;
    var x1i = cx + Math.cos(a0) * innerR, y1i = cy + Math.sin(a0) * innerR;
    var x2i = cx + Math.cos(a1) * innerR, y2i = cy + Math.sin(a1) * innerR;
    var x1o = cx + Math.cos(a0) * outerR, y1o = cy + Math.sin(a0) * outerR;
    var x2o = cx + Math.cos(a1) * outerR, y2o = cy + Math.sin(a1) * outerR;
    var large = sectorSpan > Math.PI ? 1 : 0;
    var d = 'M ' + x1i + ' ' + y1i + ' L ' + x1o + ' ' + y1o + ' A ' + outerR + ' ' + outerR + ' 0 ' + large + ' 1 ' + x2o + ' ' + y2o + ' L ' + x2i + ' ' + y2i + ' A ' + innerR + ' ' + innerR + ' 0 ' + large + ' 0 ' + x1i + ' ' + y1i + ' Z';
    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d); path.setAttribute('fill', catColors[cat]); path.setAttribute('opacity', '0.10');
    deco.appendChild(path);
    var divLine = document.createElementNS(SVGNS, 'line');
    divLine.setAttribute('x1', cx); divLine.setAttribute('y1', cy);
    divLine.setAttribute('x2', x1o); divLine.setAttribute('y2', y1o);
    divLine.setAttribute('stroke', catColors[cat]); divLine.setAttribute('stroke-width', '1');
    divLine.setAttribute('stroke-opacity', '0.18'); divLine.setAttribute('stroke-dasharray', '3,5');
    deco.appendChild(divLine);
    var la = (a0 + a1) / 2, lr = outerR + 32;
    var tx = cx + Math.cos(la) * lr, ty = cy + Math.sin(la) * lr;
    var txt = document.createElementNS(SVGNS, 'text');
    txt.setAttribute('x', String(tx)); txt.setAttribute('y', String(ty)); txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('fill', catColors[cat]); txt.setAttribute('font-size', '11.5'); txt.setAttribute('font-weight', '700');
    txt.setAttribute('letter-spacing', '2'); txt.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    txt.setAttribute('opacity', '0.85'); txt.textContent = (catLabels[cat] || cat).toUpperCase();
    deco.appendChild(txt);
  });
  masteryLevels.forEach(function (lvl, li) {
    var r = (lvl.radius[0] + lvl.radius[1]) / 2;
    var circle = document.createElementNS(SVGNS, 'circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', String(r));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', li === 3 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)');
    circle.setAttribute('stroke-width', li === 3 ? '1.5' : '1');
    circle.setAttribute('stroke-dasharray', li === 3 ? '4,6' : '3,8');
    deco.appendChild(circle);
    var ringText = document.createElementNS(SVGNS, 'text');
    ringText.setAttribute('x', String(cx + 6)); ringText.setAttribute('y', String(cy - r + 14));
    ringText.setAttribute('fill', 'var(--ink-3)'); ringText.setAttribute('font-size', '8.5');
    ringText.setAttribute('letter-spacing', '2'); ringText.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    ringText.setAttribute('opacity', '0.5'); ringText.textContent = lvl.label.toUpperCase();
    deco.appendChild(ringText);
  });
  var cGlow = document.createElementNS(SVGNS, 'circle');
  cGlow.setAttribute('cx', cx); cGlow.setAttribute('cy', cy); cGlow.setAttribute('r', '140');
  cGlow.setAttribute('fill', 'url(#cy-center-glow)'); deco.appendChild(cGlow);
  var hubRing = document.createElementNS(SVGNS, 'circle');
  hubRing.setAttribute('cx', cx); hubRing.setAttribute('cy', cy); hubRing.setAttribute('r', String(innerR - 4));
  hubRing.setAttribute('fill', 'none'); hubRing.setAttribute('stroke', 'oklch(0.80 0.135 65)');
  hubRing.setAttribute('stroke-width', '1'); hubRing.setAttribute('stroke-opacity', '0.25');
  deco.appendChild(hubRing);
  var cCount = document.createElementNS(SVGNS, 'text');
  cCount.setAttribute('id', 'cy-center-count'); cCount.setAttribute('x', cx); cCount.setAttribute('y', String(cy - 4));
  cCount.setAttribute('text-anchor', 'middle'); cCount.setAttribute('dominant-baseline', 'middle');
  cCount.setAttribute('fill', 'oklch(0.80 0.135 65)');
  cCount.setAttribute('font-size', '26'); cCount.setAttribute('font-weight', '700');
  cCount.setAttribute('font-family', 'Inter, system-ui, sans-serif'); cCount.textContent = String(allNodes.length);
  deco.appendChild(cCount);
  var cLabel = document.createElementNS(SVGNS, 'text');
  cLabel.setAttribute('x', cx); cLabel.setAttribute('y', String(cy + 18));
  cLabel.setAttribute('text-anchor', 'middle'); cLabel.setAttribute('fill', tok('--ink-3', '#666'));
  cLabel.setAttribute('font-size', '9'); cLabel.setAttribute('letter-spacing', '1.5');
  cLabel.setAttribute('font-family', 'Inter, sans-serif'); cLabel.textContent = 'VISIBLE';
  deco.appendChild(cLabel);

  var mount = document.createElement('div');
  mount.className = 'cy-mount';
  stage.appendChild(mount);

  // controls
  var ctrls = document.createElement('div');
  ctrls.className = 'canvas-ctrls';
  ctrls.innerHTML = '<button class="canvas-btn" data-a="expand-all" title="Expand all">&#8862;</button><button class="canvas-btn" data-a="collapse-all" title="Collapse to defaults">&#8863;</button><button class="canvas-btn" data-a="in" title="Zoom in">+</button><button class="canvas-btn" data-a="out" title="Zoom out">&#8722;</button><button class="canvas-btn" data-a="reset" title="Reset view">&#8617;</button><div class="canvas-zoom-pct">100%</div>';
  stage.appendChild(ctrls);

  // legend
  if (activeCats.length) {
    var legend = document.createElement('div');
    legend.className = 'canvas-legend';
    activeCats.forEach(function (cat) {
      var it = document.createElement('div'); it.className = 'canvas-legend-item';
      it.innerHTML = '<span class="canvas-legend-dot" style="background:' + catColors[cat] + ';color:' + catColors[cat] + '"></span>' + esc(catLabels[cat] || cat);
      legend.appendChild(it);
    });
    stage.appendChild(legend);
  }

  // search
  var searchEl = document.createElement('input');
  searchEl.className = 'input canvas-search';
  searchEl.placeholder = 'Find node\u2026';
  stage.appendChild(searchEl);
  var searchResults = document.createElement('div');
  searchResults.className = 'canvas-search-results';
  stage.appendChild(searchResults);
  searchEl.oninput = function () {
    var q = searchEl.value.toLowerCase().trim();
    if (q.length < 2) { searchResults.classList.remove('open'); searchResults.innerHTML = ''; return; }
    var matches = allNodes.filter(function (n) { return (n.label || n.id || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    if (!matches.length) { searchResults.classList.remove('open'); searchResults.innerHTML = ''; return; }
    searchResults.classList.add('open');
    searchResults.innerHTML = matches.map(function (n) {
      var d = depthOf[n.id] || 0;
      return '<div class="palette-item" data-id="' + esc(n.id) + '"><span class="pi-icon">&#9670;</span><span class="pi-title">' + esc(n.label || n.id) + '</span><span class="pi-meta">d' + d + ' \xB7 ' + esc(n.id) + '</span></div>';
    }).join('');
    $$('.palette-item', searchResults).forEach(function (el) {
      el.onclick = function () {
        var cur = byId[el.dataset.id];
        while (cur && cur.parent_id) { expanded.add(cur.parent_id); cur = byId[cur.parent_id]; }
        applyView(true);
        setTimeout(function () {
          var target = cy.getElementById(el.dataset.id);
          target.removeClass('dim'); target.addClass('focused');
          setTimeout(function () { target.removeClass('focused'); }, 1400);
          cy.animate({ center: { eles: target }, zoom: 1.15 }, { duration: 650, easing: 'ease-out' });
        }, 420);
        searchResults.classList.remove('open'); searchEl.value = '';
      };
    });
  };

  // tooltip
  var tooltip = document.createElement('div');
  tooltip.className = 'canvas-tooltip';
  stage.appendChild(tooltip);

  // minimap
  var minimap = document.createElement('div');
  minimap.className = 'canvas-minimap';
  var mmCanvas = document.createElement('canvas');
  var mmW = 140, mmH = 140;
  mmCanvas.width = mmW * 2; mmCanvas.height = mmH * 2;
  mmCanvas.style.width = mmW + 'px'; mmCanvas.style.height = mmH + 'px';
  minimap.appendChild(mmCanvas);
  stage.appendChild(minimap);
  var mmCtx = mmCanvas.getContext('2d');
  mmCtx.scale(2, 2);

  body.appendChild(stage);

  // ---- cy ----
  var cy = CY({
    container: mount, elements: elements, style: buildStyle(),
    minZoom: 0.15, maxZoom: 3, wheelSensitivity: 0.25, pixelRatio: 'auto',
    layout: { name: 'preset', fit: false }
  });

  function updateCenterStat(n) {
    var t = deco.querySelector('#cy-center-count');
    if (t) t.textContent = String(n);
  }

  function applyView(animate) {
    var visSet = new Set();
    allNodes.forEach(function (n) { if (isVis(n)) visSet.add(n.id); });
    var ANIM = animate ? { duration: 420, easing: 'ease-out' } : null;
    var ANIM_OUT = animate ? { duration: 320, easing: 'ease-in' } : null;
    cy.batch(function () {
      allNodes.forEach(function (n) {
        var el = cy.getElementById(n.id);
        var p = fullPos[n.id] || { x: cx, y: cy };
        if (visSet.has(n.id)) {
          if (el.hasClass('cy-collapse-hidden') || el.hidden()) {
            el.position(p);
            el.show();
            el.removeClass('cy-collapse-hidden');
            if (ANIM) el.style('opacity', 0);
          }
          if (ANIM) {
            el.animate({ position: { x: p.x, y: p.y }, style: { 'opacity': 1 } }, ANIM, { complete: function () { el.style('opacity', 1); } });
          } else {
            el.position(p); el.style('opacity', 1);
          }
        } else {
          if (!el.hidden() && !el.hasClass('cy-collapse-hidden')) {
            if (ANIM_OUT) {
              var par = byId[n.parent_id];
              var pp = par ? cy.getElementById(par.id).position() : p;
              el.addClass('cy-collapse-hidden');
              el.animate({ position: { x: pp.x, y: pp.y }, style: { 'opacity': 0 } }, ANIM_OUT, { complete: function () { el.hide(); } });
            } else {
              el.hide();
            }
          }
        }
      });
      cy.edges().forEach(function (ed) {
        var both = visSet.has(ed.source().id()) && visSet.has(ed.target().id());
        if (both) { if (ed.hidden()) ed.show(); if (ANIM) ed.animate({ style: { 'line-opacity': 0.28 } }, ANIM); else ed.style('line-opacity', 0.28); }
        else { if (!ed.hidden()) { if (ANIM_OUT) ed.animate({ style: { 'line-opacity': 0 } }, ANIM_OUT, { complete: function () { ed.hide(); } }); else ed.hide(); } }
      });
      updateCenterStat(visSet.size);
    });
    relaxCollisions();
  }

  // initial bloom: start all at center, hidden if not visible
  var visInitial = new Set(); allNodes.forEach(function (n) { if (isVis(n)) visInitial.add(n.id); });
  cy.batch(function () {
    allNodes.forEach(function (n) {
      var el = cy.getElementById(n.id);
      el.style('opacity', 0);
      if (!visInitial.has(n.id)) el.hide();
      else el.style('opacity', 0);
    });
    cy.edges().forEach(function (ed) { if (!(visInitial.has(ed.source().id()) && visInitial.has(ed.target().id()))) ed.hide(); });
  });
  updateCenterStat(visInitial.size);

  // controls
  ctrls.querySelector('[data-a="in"]').onclick = function () { var r = stage.getBoundingClientRect(); cy.zoom({ level: cy.zoom() * 1.25, renderedPosition: { x: r.width / 2, y: r.height / 2 } }); };
  ctrls.querySelector('[data-a="out"]').onclick = function () { var r = stage.getBoundingClientRect(); cy.zoom({ level: cy.zoom() / 1.25, renderedPosition: { x: r.width / 2, y: r.height / 2 } }); };
  ctrls.querySelector('[data-a="reset"]').onclick = function () { cy.animate({ fit: { eles: cy.elements().not('.cy-collapse-hidden, :hidden') }, zoom: fitZoom, duration: 420, easing: 'ease-out' }); };
  ctrls.querySelector('[data-a="expand-all"]').onclick = function () { allNodes.forEach(function (n) { expanded.add(n.id); }); applyView(true); revealFit(); };
  ctrls.querySelector('[data-a="collapse-all"]').onclick = function () {
    expanded.clear();
    rootNodes.forEach(function (r) { expanded.add(r.id); });
    rootNodes.forEach(function (r) { (childrenOf[r.id] || []).forEach(function (c) { expanded.add(c.id); (childrenOf[c.id] || []).forEach(function (gc) { expanded.add(gc.id); }); }); });
    applyView(true); revealFit();
  };

  var fitZoom = 0.36;
  function revealFit() { setTimeout(function () { cy.animate({ fit: { eles: cy.elements().not(':hidden') }, duration: 420, easing: 'ease-out' }, {}); }, 440); }

  // deco transform sync
  function syncDeco() {
    var z = cy.zoom(), p = cy.pan();
    deco.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px) scale(' + z + ')';
    var zc = ctrls.querySelector('.canvas-zoom-pct'); if (zc) zc.textContent = Math.round(z * 100) + '%';
    drawMinimap();
  }
  cy.on('pan zoom resize', syncDeco);

  // minimap
  var mmRAF = 0;
  function drawMinimap() {
    if (mmRAF) return;
    mmRAF = requestAnimationFrame(function () {
      mmRAF = 0;
      var bg2 = tok('--elevated', '#1a1a1a');
      mmCtx.fillStyle = bg2; mmCtx.fillRect(0, 0, mmW, mmH);
      var fit = Math.min(mmW / totalW, mmH / totalH);
      var mzc = mmW / 2, myc = mmH / 2;
      mmCtx.strokeStyle = 'rgba(255,255,255,0.06)'; mmCtx.lineWidth = 0.5;
      masteryLevels.forEach(function (lvl) {
        var r = (lvl.radius[0] + lvl.radius[1]) / 2 * fit;
        mmCtx.beginPath(); mmCtx.arc(mzc + (cx - totalW / 2) * fit, myc + (cy - totalH / 2) * fit, r, 0, Math.PI * 2); mmCtx.stroke();
      });
      mmCtx.lineWidth = 0.4; mmCtx.strokeStyle = 'rgba(255,255,255,0.1)';
      cy.edges().forEach(function (ed) {
        if (ed.hidden()) return;
        var s = ed.source().position(), t = ed.target().position();
        var off = cy.pan(), z = cy.zoom();
        mmCtx.beginPath();
        mmCtx.moveTo(mzc + ((s.x) - totalW / 2) * fit, myc + ((s.y) - totalH / 2) * fit);
        mmCtx.lineTo(mzc + ((t.x) - totalW / 2) * fit, myc + ((t.y) - totalH / 2) * fit);
        mmCtx.stroke();
      });
      cy.nodes().forEach(function (n) {
        if (n.hidden()) return;
        var p = n.position();
        mmCtx.beginPath();
        mmCtx.arc(mzc + (p.x - totalW / 2) * fit, myc + (p.y - totalH / 2) * fit, 1.5, 0, Math.PI * 2);
        mmCtx.fillStyle = catColors[n.data('cat')] || tok('--accent', '#3dd6c6');
        mmCtx.fill();
      });
      var r = stage.getBoundingClientRect();
      var z = cy.zoom(), p = cy.pan();
      mmCtx.strokeStyle = tok('--accent', '#3dd6c6'); mmCtx.lineWidth = 1;
      var vx = (-p.x) / z, vy = (-p.y) / z, vw = r.width / z, vh = r.height / z;
      mmCtx.strokeRect(mzc + (vx - totalW / 2) * fit, myc + (vy - totalH / 2) * fit, vw * fit, vh * fit);
    });
  }

  // tap: single toggles expand/collapse, double opens sheet
  var tapTimers = {};
  cy.on('tap', 'node', function (evt) {
    var n = byId[evt.target.id()];
    if (!n) return;
    var id = n.id;
    if (tapTimers[id]) { clearTimeout(tapTimers[id]); tapTimers[id] = 0; openNodeSheet(n.id); return; }
    tapTimers[id] = setTimeout(function () {
      tapTimers[id] = 0;
      var hasChildren = (childrenOf[n.id] || []).length > 0;
      if (hasChildren) {
        if (expanded.has(n.id)) collapseAll(n.id); else expanded.add(n.id);
        applyView(true);
      } else {
        openNodeSheet(n.id);
      }
    }, 220);
  });

  function collapseAll(id) {
    expanded.delete(id);
    (childrenOf[id] || []).forEach(function (c) { collapseAll(c.id); });
  }

  // hover highlight path to root + tooltip
  function clearFocus() {
    cy.nodes().removeClass('dim focused');
    cy.edges().removeClass('dim');
    tooltip.classList.remove('open');
  }
  cy.on('mouseover', 'node', function (evt) {
    var n = byId[evt.target.id()];
    if (!n) return;
    var path = new Set();
    var cur = n;
    while (cur) { path.add(cur.id); cur = cur.parent_id ? byId[cur.parent_id] : null; }
    (childrenOf[n.id] || []).forEach(function (c) { path.add(c.id); });
    cy.batch(function () {
      cy.nodes().forEach(function (nd) { if (!path.has(nd.id())) nd.addClass('dim'); else nd.removeClass('dim'); });
      cy.edges().forEach(function (ed) { if (path.has(ed.source().id()) && path.has(ed.target().id())) ed.removeClass('dim'); else ed.addClass('dim'); });
      evt.target.removeClass('dim').addClass('focused');
    });
    var hasChildren = (childrenOf[n.id] || []).length > 0;
    var isExp = expanded.has(n.id);
    var d = depthOf[n.id] || 0;
    tooltip.innerHTML = '<div style="font-size:13px;font-weight:600;color:var(--ink)">' + esc(n.label || n.id) + '</div>' +
      '<div style="font-size:10px;color:var(--ink-3);margin-top:2px">' + esc(n.type || 'node') + (n.status ? ' \xB7 ' + esc(n.status) : '') + (d ? ' \xB7 depth ' + d : '') + '</div>' +
      (hasChildren ? '<div style="font-size:9px;color:var(--accent);margin-top:4px">' + (isExp ? 'click to collapse \xB7 dbl to open' : 'click to expand \xB7 dbl to open') + '</div>' : '<div style="font-size:9px;color:var(--ink-3);margin-top:4px">click to open</div>');
    var rp = evt.target.renderedPosition({ });
    var sr = stage.getBoundingClientRect();
    var lx = rp.x + 14, ly = rp.y + 14;
    var tw = tooltip.offsetWidth || 220, th = tooltip.offsetHeight || 80;
    if (lx + tw > sr.width) lx = rp.x - tw - 14;
    if (ly + th > sr.height) ly = rp.y - th - 14;
    lx = Math.max(0, lx); ly = Math.max(0, ly);
    tooltip.style.left = lx + 'px';
    tooltip.style.top = ly + 'px';
    tooltip.classList.add('open');
  });
  cy.on('mouseout', 'node', clearFocus);
  cy.on('tap', function (evt) {
    if (evt.target === cy) clearFocus();
  });

  // theme support
  var themeObs = new MutationObserver(function () { cy.style(buildStyle()); });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  state._cc = state._cc || [];
  state._cc.push(function () { themeObs.disconnect(); });

  // reducer: hide non-visible then animate in
  requestAnimationFrame(function () {
    cy.animate({ fit: { eles: cy.elements(), padding: 60 }, zoom: 0.34, duration: 0 }, {});
    syncDeco();
    applyView(true);
  });

  // keyboard pan/zoom parity
  function kbNav(e) {
    if (!document.body.contains(stage)) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { cy.panBy(60, 0); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { cy.panBy(-60, 0); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cy.panBy(0, 60); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { cy.panBy(0, -60); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { var r = stage.getBoundingClientRect(); cy.zoom({ level: cy.zoom() * 1.15, renderedPosition: { x: r.width / 2, y: r.height / 2 } }); e.preventDefault(); }
    else if (e.key === '-') { var r2 = stage.getBoundingClientRect(); cy.zoom({ level: cy.zoom() / 1.15, renderedPosition: { x: r2.width / 2, y: r2.height / 2 } }); e.preventDefault(); }
    else if (e.key === '0') { cy.animate({ fit: { eles: cy.elements().not(':hidden'), padding: 60 } }, { duration: 420, easing: 'ease-out' }); e.preventDefault(); }
  }
  document.addEventListener('keydown', kbNav);
  state._cc.push(function () { document.removeEventListener('keydown', kbNav); });

  var ro = new ResizeObserver(function () { syncDeco(); });
  ro.observe(stage);
  state._cc.push(function () { ro.disconnect(); });
  state._cc.push(function () { cy.destroy(); });
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
      // Build sparkline from recs in this branch
      const branchRecs = state.recs.filter(r => {
        const k = r.dedup_key || '';
        return k.startsWith(b.id + '-') || k === b.id;
      });
      const sparkPoints = [];
      const sparkW = 80, sparkH = 24;
      if (branchRecs.length > 1) {
        // Group by week
        const weeks = {};
        branchRecs.forEach(r => {
          const d = r.consumed_date || r.created_at || '';
          if (!d) return;
          const wk = d.slice(0, 10);
          weeks[wk] = (weeks[wk] || 0) + 1;
        });
        const wkKeys = Object.keys(weeks).sort();
        const maxW = Math.max(...Object.values(weeks), 1);
        const step = wkKeys.length > 1 ? sparkW / (wkKeys.length - 1) : sparkW / 2;
        wkKeys.forEach((k, i) => {
          const x = i * step;
          const y = sparkH - (weeks[k] / maxW) * (sparkH - 4) - 2;
          sparkPoints.push(x.toFixed(1) + ',' + y.toFixed(1));
        });
      }
      const sparkSvg = sparkPoints.length > 1
        ? '<svg class="bc-spark" width="' + sparkW + '" height="' + sparkH + '" viewBox="0 0 ' + sparkW + ' ' + sparkH + '"><polyline points="' + sparkPoints.join(' ') + '" fill="none" stroke="var(--consumed)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '';
      el.innerHTML =
        '<div class="bc-head"><div class="bc-id">' + esc(b.id) + '</div>' + sparkSvg + '</div>' +
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
  const DAY = 86400000, now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const d30 = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const d60 = new Date(now - 60 * DAY).toISOString().slice(0, 10);
  const catColors = ['#e8a838', '#3dd6c6', '#4ade80', '#f97316', '#facc15', '#a78bfa'];

  // Metric: drift = (share of window pushes in cat) \u2212 (decay-weighted love/like share of consumed).
  // Locks decay with 90-day tau so stale mastery stops anchoring the chart.
  const catRecs = (cat) => {
    const branchIds = byCat[cat].map(n => n.id);
    const prefix = (id) => branchIds.some(b => id.startsWith(b + '-') || id === b);
    return recs.filter(r => prefix(r.dedup_key || ''));
  };
  const lockedShareOf = (consumed, asOf) => {
    let wSum = 0, wLock = 0;
    consumed.forEach(r => {
      const dt = (r.consumed_date || r.created_at || '').slice(0, 10);
      const age = Math.max(0, (Date.parse(asOf) - Date.parse(dt)) / DAY);
      const w = Math.exp(-age / 90);
      wSum += w;
      if (r.user_rating === 'love' || r.user_rating === 'like') wLock += w;
    });
    return wSum ? wLock / wSum : 0;
  };
  const compute = (from, to, asOf) => {
    const perCat = cats.map(cat => {
      const mine = catRecs(cat);
      const pushes = mine.filter(r => { const d = (r.created_at || '').slice(0, 10); return d >= from && d < to; });
      const consumed = mine.filter(r => r.status === 'consumed' && (r.consumed_date || r.created_at || '').slice(0, 10) < asOf);
      return { pushes, consumed, locked: lockedShareOf(consumed, asOf) };
    });
    const totalPushes = perCat.reduce((a, c) => a + c.pushes.length, 0);
    return perCat.map(c => ({ pushShare: totalPushes ? c.pushes.length / totalPushes : 0, drift: (totalPushes ? c.pushes.length / totalPushes : 0) - c.locked, locked: c.locked, pushes: c.pushes, consumed: c.consumed }));
  };
  const cur = compute(d30, today + 'z', today + 'z');
  const prev = compute(d60, d30, d30);

  const data = cats.map((cat, i) => ({
    cat: cat.replace('cat-', ''), key: cat,
    drift: cur[i].drift, prevDrift: prev[i].drift,
    locked: cur[i].locked, pushShare: cur[i].pushShare,
    pushes: cur[i].pushes, consumed: cur[i].consumed,
    color: catColors[i % catColors.length]
  }));
  const totalConsumed = data.reduce((a, d) => a + d.consumed.length, 0);

  const wrap = document.createElement('div');
  wrap.style.maxWidth = '1100px';

  // Baseline notice while data is sparse
  if (totalConsumed < 5) {
    const b = document.createElement('div');
    b.className = 'radar-baseline';
    b.innerHTML = '<strong>Collecting baseline</strong> \u2014 ' + totalConsumed + '/5 items consumed. Drift readings stabilize once 5+ items are rated.';
    wrap.appendChild(b);
  }

  const layout = document.createElement('div');
  layout.className = 'radar-layout';

  // ----- Chart -----
  const chartCard = document.createElement('div');
  chartCard.className = 'radar-chart-card';
  const chartWrap = document.createElement('div');
  chartWrap.className = 'radar-chart-wrap';
  chartWrap.style.position = 'relative';
  const size = 340, cx = size / 2, cy = size / 2, R = 118;
  const n = data.length;
  const angleStep = (2 * Math.PI) / n;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('class', 'radar-spider');
  const mk = (tag, attrs, cls) => { const el = document.createElementNS(svgNS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); if (cls) el.setAttribute('class', cls); return el; };
  const pt = (i, val) => { const a = i * angleStep - Math.PI / 2; return [cx + Math.cos(a) * R * val, cy + Math.sin(a) * R * val]; };
  const driftVal = (drift) => Math.min(1, Math.max(0, (drift + 1) / 2));

  // Grid rings + value labels (drift scale: center \u22121, edge +1)
  [0.25, 0.5, 0.75, 1].forEach(frac => {
    const pts = [];
    for (let i = 0; i < n; i++) { const p = pt(i, frac); pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1)); }
    svg.appendChild(mk('polygon', { points: pts.join(' ') }, 'radar-ring'));
    const lbl = mk('text', { x: cx + 5, y: (cy - R * frac + 3).toFixed(1) }, 'radar-ring-label');
    lbl.textContent = (2 * frac - 1 > 0 ? '+' : '') + (2 * frac - 1).toFixed(frac === 0.5 ? 0 : 1);
    svg.appendChild(lbl);
  });

  // Axis lines
  for (let i = 0; i < n; i++) {
    const p = pt(i, 1);
    svg.appendChild(mk('line', { x1: cx, y1: cy, x2: p[0].toFixed(1), y2: p[1].toFixed(1) }, 'radar-axis'));
  }

  const animG = mk('g', {}, 'radar-anim');
  svg.appendChild(animG);

  // Category sectors
  data.forEach((d, i) => {
    const a = i * angleStep - Math.PI / 2;
    const val = driftVal(d.drift);
    const p1 = [cx + Math.cos(a - angleStep / 2) * R * val, cy + Math.sin(a - angleStep / 2) * R * val];
    const p2 = [cx + Math.cos(a + angleStep / 2) * R * val, cy + Math.sin(a + angleStep / 2) * R * val];
    const poly = mk('polygon', { points: cx + ',' + cy + ' ' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1), fill: d.color + '33' }, 'radar-sector');
    poly.dataset.index = i;
    animG.appendChild(poly);
  });

  // Previous-period polygon (dashed)
  const prevPts = data.map((d, i) => { const p = pt(i, driftVal(d.prevDrift)); return p[0].toFixed(1) + ',' + p[1].toFixed(1); });
  animG.appendChild(mk('polygon', { points: prevPts.join(' ') }, 'radar-prev'));

  // Current data polygon
  const dataPts = data.map((d, i) => { const p = pt(i, driftVal(d.drift)); return p[0].toFixed(1) + ',' + p[1].toFixed(1); });
  animG.appendChild(mk('polygon', { points: dataPts.join(' ') }, 'radar-data'));

  // Dots + labels
  data.forEach((d, i) => {
    const p = pt(i, driftVal(d.drift));
    const c = mk('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 6, fill: d.color }, 'radar-dot');
    c.dataset.index = i;
    animG.appendChild(c);
    const lp = pt(i, 1);
    const txt = mk('text', { x: (cx + (lp[0] - cx) * 1.22).toFixed(1), y: (cy + (lp[1] - cy) * 1.22).toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'radar-label');
    txt.textContent = d.cat;
    txt.dataset.index = i;
    svg.appendChild(txt);
  });

  // Tooltip + selection
  const tooltip = document.createElement('div');
  tooltip.className = 'radar-tooltip';
  tooltip.style.cssText = 'position:absolute;background:var(--overlay);border:1px solid var(--border-strong);border-radius:8px;padding:8px 12px;font-size:12px;pointer-events:none;opacity:0;transition:opacity 150ms;z-index:10;box-shadow:0 4px 16px oklch(0 0 0 / 0.3);';
  chartWrap.appendChild(tooltip);
  const showTip = (i, mx, my) => {
    const d = data[i];
    const delta = d.drift - d.prevDrift;
    tooltip.innerHTML = '<strong>' + esc(d.cat) + '</strong><br>Drift: ' + (d.drift > 0 ? '+' : '') + d.drift.toFixed(2) +
      ' <span style="color:var(--ink-3)">(' + (delta >= 0 ? '+' : '') + delta.toFixed(2) + ' vs 30d ago)</span>' +
      '<br>Locked: ' + Math.round(d.locked * 100) + '% \xB7 Push share: ' + Math.round(d.pushShare * 100) + '%<br>Consumed: ' + d.consumed.length;
    tooltip.style.left = (mx + 16) + 'px';
    tooltip.style.top = (my - 8) + 'px';
    tooltip.style.opacity = '1';
  };
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const sx = size / rect.width;
    let hit = false;
    svg.querySelectorAll('.radar-dot').forEach(dot => {
      const dist = Math.hypot(mx * sx - parseFloat(dot.getAttribute('cx')), my * sx - parseFloat(dot.getAttribute('cy')));
      if (dist < 12) { hit = true; showTip(parseInt(dot.dataset.index), mx, my); }
    });
    if (!hit && e.target && e.target.classList && (e.target.classList.contains('radar-sector') || e.target.classList.contains('radar-label'))) {
      hit = true; showTip(parseInt(e.target.dataset.index), mx, my);
    }
    if (!hit) tooltip.style.opacity = '0';
  });
  svg.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });

  chartWrap.appendChild(svg);
  chartCard.appendChild(chartWrap);
  layout.appendChild(chartCard);

  // ----- Category cards -----
  const listWrap = document.createElement('div');
  listWrap.className = 'radar-cat-list';
  const sorted = data.map((d, i) => ({ d, i })).sort((a, b) => Math.abs(b.d.drift) - Math.abs(a.d.drift));
  sorted.forEach(({ d, i }) => {
    const card = document.createElement('button');
    card.className = 'radar-cat-card';
    card.dataset.index = i;
    const pct = Math.min(50, Math.abs(d.drift) * 50);
    const barStyle = d.drift >= 0 ? 'left:50%;width:' + pct + '%' : 'right:50%;width:' + pct + '%';
    card.innerHTML = '<span class="radar-dot-indicator" style="background:' + d.color + '"></span>' +
      '<span class="radar-cat-name">' + esc(d.cat) + '</span>' +
      '<span class="radar-cat-bar"><span class="radar-cat-bar-fill ' + (d.drift >= 0 ? 'pos' : 'neg') + '" style="' + barStyle + '"></span></span>' +
      '<span class="radar-detail-drift ' + (d.drift > 0 ? 'pos' : d.drift < 0 ? 'neg' : '') + '">' + (d.drift > 0 ? '+' : '') + d.drift.toFixed(2) + '</span>' +
      '<span class="radar-cat-meta">' + d.consumed.length + ' consumed</span>';
    card.onclick = () => select(i);
    listWrap.appendChild(card);
  });
  layout.appendChild(listWrap);
  wrap.appendChild(layout);

  // ----- Detail panel (touch-friendly, click to open) -----
  const panel = document.createElement('div');
  panel.className = 'radar-panel';
  wrap.appendChild(panel);

  const itemRow = (r, metaExtra) => {
    const meta = (r.creator || '') + (r.user_rating && r.user_rating !== 'unset' ? ' \xB7 ' + r.user_rating : '') + (metaExtra || '');
    const inner = esc(r.video_title || 'Untitled') + '<div class="radar-item-meta">' + esc(meta) + '</div>';
    if (r.video_url) {
      const a = document.createElement('a');
      a.className = 'radar-item'; a.href = r.video_url; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = inner;
      return a;
    }
    const div = document.createElement('div');
    div.className = 'radar-item';
    div.innerHTML = inner;
    return div;
  };

  const select = (idx) => {
    const d = data[idx];
    listWrap.querySelectorAll('.radar-cat-card').forEach(c => c.classList.toggle('sel', parseInt(c.dataset.index) === idx));
    svg.querySelectorAll('.radar-dot').forEach(c => c.classList.toggle('sel', parseInt(c.dataset.index) === idx));
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'radar-panel-title';
    title.innerHTML = '<span class="radar-dot-indicator" style="background:' + d.color + '"></span>' + esc(d.cat) +
      ' <span class="radar-detail-drift ' + (d.drift > 0 ? 'pos' : d.drift < 0 ? 'neg' : '') + '">' + (d.drift > 0 ? '+' : '') + d.drift.toFixed(2) + '</span>';
    panel.appendChild(title);
    const sub = document.createElement('div');
    sub.className = 'radar-panel-sub';
    sub.textContent = d.drift > 0.15 ? 'Exploring \u2014 recent pushes outpace locked taste. Keep going or the queue is over-feeding this.' :
      d.drift < -0.15 ? 'Locked in \u2014 you love this but nothing new is coming in. Good resurfacing candidate.' :
      'Balanced \u2014 pushes roughly match your proven taste.';
    panel.appendChild(sub);
    const cols = document.createElement('div');
    cols.className = 'radar-cols';
    // Recent pushes
    const c1 = document.createElement('div');
    c1.innerHTML = '<div class="radar-col-head">Recent pushes (30d)</div>';
    const pushes = d.pushes.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 5);
    if (pushes.length) pushes.forEach(r => c1.appendChild(itemRow(r, ' \xB7 pushed ' + (r.created_at || '').slice(0, 10))));
    else c1.innerHTML += '<div class="radar-none">No pushes in the last 30 days.</div>';
    cols.appendChild(c1);
    // Resurface candidates: loved/liked, longest since consumed
    const c2 = document.createElement('div');
    c2.innerHTML = '<div class="radar-col-head">Resurface candidates</div>';
    const cand = d.consumed.filter(r => r.user_rating === 'love' || r.user_rating === 'like')
      .sort((a, b) => (a.consumed_date || '').localeCompare(b.consumed_date || '')).slice(0, 5);
    if (cand.length) cand.forEach(r => c2.appendChild(itemRow(r, ' \xB7 consumed ' + (r.consumed_date || '?'))));
    else c2.innerHTML += '<div class="radar-none">Nothing locked in yet \u2014 rate items love/like to build this list.</div>';
    cols.appendChild(c2);
    panel.appendChild(cols);
  };

  // Chart click = same selection
  svg.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.index != null) select(parseInt(e.target.dataset.index));
  });

  // Summary stats
  const statsWrap = document.createElement('div');
  statsWrap.style.cssText = 'display:flex;gap:16px;margin-top:16px;flex-wrap:wrap;font-size:12px;color:var(--ink-2)';
  const exploring = data.filter(d => d.drift > 0.15).length;
  const lockedIn = data.filter(d => d.drift < -0.15).length;
  statsWrap.innerHTML = '<span><strong>Total consumed:</strong> ' + totalConsumed + '</span>' +
    '<span><strong>Exploring:</strong> ' + exploring + ' categories</span>' +
    '<span><strong>Locked in:</strong> ' + lockedIn + ' categories</span>';
  wrap.appendChild(statsWrap);

  const hint = document.createElement('div');
  hint.className = 'muted'; hint.style.cssText = 'font-size:11px;margin-top:12px';
  hint.textContent = 'Drift = (share of last-30d pushes) \u2212 (love/like share of consumed, 90-day decay). Dashed = 30 days ago. Rings show drift \u22121 \u2192 +1. Click a category for details.';
  wrap.appendChild(hint);

  body.appendChild(wrap);

  // Preselect highest-drift category
  if (sorted.length) select(sorted[0].i);
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
  wrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;max-width:1100px';

  // Core filter card
  if (P.profile.core_filter || P.profile.identity_json) {
    const c = document.createElement('div');
    c.className = 'card profile-card';
    c.style.cssText = 'grid-column:1/-1';
    c.innerHTML = '<div class="card-head"><h3>Core filter</h3><span class="mono dim" style="font-size:11px">Identity & decision compass</span></div><div class="card-body">' + esc(P.profile.core_filter || P.profile.identity_json || '\u2014') + '</div>';
    wrap.appendChild(c);
  }

  // Priority order card
  if (pri.length) {
    const c = document.createElement('div');
    c.className = 'card profile-card';
    let h = '<div class="card-head"><h3>Priority order</h3><span class="count">' + pri.length + '</span></div><ol class="pri-list" style="padding-left:0;list-style:none">';
    pri.forEach((p, i) => {
      h += '<li style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);min-height:36px">' +
        '<span class="pri-rank" style="width:28px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--accent);font-weight:600">#' + p.rank + '</span>' +
        '<span class="pri-id mono" style="font-size:11px;color:var(--ink-3);min-width:80px">' + esc(p.branch_id) + '</span>' +
        '<span style="font-size:13px;color:var(--ink);flex:1">' + esc(p.label || '') + '</span>' +
        '</li>';
    });
    h += '</ol>';
    c.innerHTML = h;
    wrap.appendChild(c);
  }

  // Patterns card
  if (patterns.length) {
    const c = document.createElement('div');
    c.className = 'card profile-card';
    c.style.cssText = 'grid-column:1/-1';
    let h = '<div class="card-head"><h3>Patterns</h3><span class="count">' + patterns.length + '</span></div><div class="pattern-list" style="display:flex;flex-direction:column;gap:12px">';
    patterns.forEach(p => {
      const strength = p.strength || 'confirmed';
      h += '<div class="pattern-row" style="padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card)">' +
        '<div class="pattern-head" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span class="strength-tag strength-' + esc(strength) + '" style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:0.03em">' + esc(strength) + '</span>' +
        '<span class="mono dim" style="font-size:11px">' + esc(p.id) + '</span>' +
        '</div>' +
        '<div class="pattern-desc" style="font-size:13px;color:var(--ink);line-height:1.5;margin-bottom:8px">' + esc(p.description) + '</div>' +
        (p.confirmed_date ? '<div class="pattern-date" style="font-size:11px;color:var(--ink-3)">' + esc(p.confirmed_date) + '</div>' : '') +
        '<div class="pattern-actions" style="display:flex;gap:6px;margin-top:8px">' +
        '<div class="strength-meter" style="display:flex;gap:4px">' + ['weak','confirmed','locked'].map(s =>
          '<button class="pt-btn' + (strength === s ? ' pt-active' : '') + '" data-s="' + s + '" data-pid="' + esc(p.id) + '" style="padding:4px 10px;font-size:11px;font-weight:500;border-radius:999px;border:1px solid var(--border);background:' + (strength === s ? 'var(--accent-tint)' : 'var(--bg)') + ';color:' + (strength === s ? 'var(--accent)' : 'var(--ink-2)') + ';cursor:pointer;transition:all 150ms ease">' + s + '</button>'
        ).join('') + '</div></div></div>';
    });
    h += '</div>';
    c.innerHTML = h;
    wrap.appendChild(c);
  }

  // Mastered card
  if (mastered.length) {
    const c = document.createElement('div');
    c.className = 'card profile-card';
    let h = '<div class="card-head"><h3>Mastered</h3><span class="count">' + mastered.length + '</span></div><div class="mastered-list" style="display:flex;flex-direction:column;gap:4px">';
    mastered.slice(0, 15).forEach(m => {
      h += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<span class="mono" style="font-size:11px;color:var(--consumed);min-width:70px">' + esc(m.id) + '</span>' +
        '<span style="font-size:13px;color:var(--ink);flex:1">' + esc(m.label) + '</span>' +
        (m.author ? '<span class="dim" style="font-size:12px">\u2014 ' + esc(m.author) + '</span>' : '') +
        '</div>';
    });
    if (mastered.length > 15) {
      h += '<div style="padding:8px 0;color:var(--ink-3);font-size:12px">+' + (mastered.length - 15) + ' more...</div>';
    }
    h += '</div>';
    c.innerHTML = h;
    wrap.appendChild(c);
  }

  // Blacklist card
  if (blacklist.length) {
    const c = document.createElement('div');
    c.className = 'card profile-card';
    c.style.cssText = 'grid-column:1/-1';
    let h = '<div class="card-head"><h3>Blacklist</h3><span class="count">' + blacklist.length + '</span></div><div class="blacklist-list" style="display:flex;flex-direction:column;gap:8px">';
    blacklist.slice(0, 20).forEach(b => {
      h += '<div style="padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card)">' +
        '<div style="display:flex;align-items:flex-start;gap:10px">' +
        '<span style="font-weight:600;font-size:13px;color:var(--rejected);flex-shrink:0">' + esc(b.name) + '</span>' +
        (b.work ? '<span class="dim" style="font-size:12px;font-style:italic">\u2014 ' + esc(b.work) + '</span>' : '') +
        '</div>' +
        (b.reason ? '<div class="dim" style="font-size:11px;margin-top:6px;padding-left:22px">' + esc(b.reason) + '</div>' : '') +
        '</div>';
    });
    if (blacklist.length > 20) {
      h += '<div style="padding:8px;color:var(--ink-3);font-size:12px">+' + (blacklist.length - 20) + ' more...</div>';
    }
    h += '</div>';
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

  // Summary stats at top
  const staleCount = health && health.stale ? health.stale.length : 0;
  const branchCount = health && health.byBranch ? health.byBranch.length : 0;
  const totalConsumed = health && health.byBranch ? health.byBranch.reduce((a, b) => a + b.consumed_count, 0) : 0;

  const summary = document.createElement('div');
  summary.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px';
  summary.innerHTML =
    '<div class="stat-block"><div class="s-label">Stale items</div><div class="s-value c-rejected">' + staleCount + '</div><div class="s-sub">>30 days old</div></div>' +
    '<div class="stat-block"><div class="s-label">Active branches</div><div class="s-value c-active">' + branchCount + '</div><div class="s-sub">with data</div></div>' +
    '<div class="stat-block"><div class="s-label">Total consumed</div><div class="s-value c-consumed">' + totalConsumed + '</div><div class="s-sub">across all branches</div></div>' +
    '<div class="stat-block"><div class="s-label">Neglected</div><div class="s-value c-rejected">' + (health && health.byBranch ? health.byBranch.filter(b => b.consumed_count === 0).length : 0) + '</div><div class="s-sub">zero consumption</div></div>';
  wrap.appendChild(summary);

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
      const ageDays = s.verified ? Math.floor((Date.now() - new Date(s.verified).getTime()) / 86400000) : 0;
      const el = document.createElement('div');
      el.className = 'archive-item';
      el.style.cssText = 'border-left:3px solid var(--rejected);padding-left:12px';
      el.innerHTML =
        '<span class="dot dot-active" style="margin-top:6px"></span>' +
        '<div style="flex:1;min-width:0"><div class="a-title" style="font-size:13px">' + esc(s.video_title) + '</div>' +
        '<div class="a-meta">' + esc(s.creator || '') + ' \xB7 queued ' + esc(fmtDate(s.verified)) + ' (' + ageDays + 'd ago)</div></div>' +
        '<div style="display:flex;gap:6px">' +
        '<button class="btn btn-sm btn-primary" data-action="consume" data-id="' + esc(s.id) + '"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Mark done</button>' +
        '<button class="btn btn-sm btn-ghost btn-danger" data-action="reject" data-id="' + esc(s.id) + '"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Reject</button>' +
        '</div>';
      wrap.appendChild(el);
    });
  }

  if (health && health.byBranch && health.byBranch.length) {
    const t = document.createElement('div');
    t.className = 'sec-title';
    t.innerHTML = 'Branch engagement <span class="count">' + health.byBranch.length + '</span>';
    wrap.appendChild(t);
    const max = Math.max(...health.byBranch.map(b => b.consumed_count), 1);
    // Sort by consumption (lowest first to highlight neglected)
    const sorted = [...health.byBranch].sort((a, b) => a.consumed_count - b.consumed_count);
    sorted.slice(0, 20).forEach(b => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const pct = Math.round(b.consumed_count / max * 100);
      const isNeglected = b.consumed_count === 0;
      const isLow = b.consumed_count > 0 && b.consumed_count <= 3;
      row.style.cssText = isNeglected ? 'background:color-mix(in oklch, var(--rejected) 6%, transparent);border-radius:6px;padding:8px 12px' : isLow ? 'background:color-mix(in oklch, var(--active) 6%, transparent);border-radius:6px;padding:8px 12px' : '';
      row.innerHTML =
        '<span class="b-label mono" style="width:140px">' + esc(b.branch) + (isNeglected ? ' <span class="bc-stale-pulse" title="neglected" style="margin-left:6px"></span>' : isLow ? ' <span class="bc-stale-pulse" title="low engagement" style="margin-left:6px;background:var(--active)"></span>' : '') + '</span>' +
        '<div class="b-track" style="flex:1"><div class="b-fill c-consumed" style="width:' + pct + '%"></div></div>' +
        '<span class="b-count" style="min-width:40px;text-align:right">' + b.consumed_count + '</span>' +
        (b.avg_rating ? '<span class="b-avg" style="font-size:11px;color:var(--ink-3);margin-left:12px;min-width:50px;text-align:right">avg ' + Number(b.avg_rating).toFixed(1) + '</span>' : '');
      wrap.appendChild(row);
    });
  }

  // Action hints
  if (staleCount > 0 || (health && health.byBranch && health.byBranch.some(b => b.consumed_count === 0))) {
    const hints = document.createElement('div');
    hints.style.cssText = 'margin-top:24px;padding:16px;background:var(--accent-tint);border:1px solid color-mix(in oklch, var(--accent) 30%, transparent);border-radius:var(--r-card)';
    hints.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px;color:var(--accent)">Smart actions</div>' +
      '<div style="font-size:13px;color:var(--ink-2);line-height:1.6">' +
      (staleCount > 0 ? '\u2022 <strong>' + staleCount + ' stale items</strong> \u2014 batch review or reject to clear the queue<br>' : '') +
      (health && health.byBranch && health.byBranch.some(b => b.consumed_count === 0) ? '\u2022 <strong>' + health.byBranch.filter(b => b.consumed_count === 0).length + ' neglected branches</strong> \u2014 consider adding relevant content or deprioritizing<br>' : '') +
      '\u2022 Use <kbd style="font-family:var(--font-mono);font-size:10px;padding:1px 4px;border-radius:3px;background:var(--elevated);border:1px solid var(--border)">g m</kbd> to jump to Map, then <kbd style="font-family:var(--font-mono);font-size:10px;padding:1px 4px;border-radius:3px;background:var(--elevated);border:1px solid var(--border)">1</kbd> for Canvas view'
      + '</div>';
    wrap.appendChild(hints);
  }

  if ((!health || !health.stale || !health.stale.length) && (!health || !health.byBranch || !health.byBranch.length)) {
    wrap.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6-8.24"/><path d="M21 3v6h-6"/></svg><div class="e-title">Nothing to resurface</div><div>All branches engaged, no stale items.</div></div>';
  }
  body.appendChild(wrap);

  // Handle action buttons
  wrap.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'consume') {
      const item = health.stale.find(s => s.id === id);
      if (item) openReviewSheet(item, 'consumed');
    } else if (action === 'reject') {
      const item = health.stale.find(s => s.id === id);
      if (item) openReviewSheet(item, 'rejected');
    }
  };
};

// feature 8: tensions
VIEWS['map.tensions'] = async (body) => {
  body.innerHTML = '<div class="loading-skeleton"><div class="skel skel-row"></div><div class="skel skel-row"></div></div>';
  let list = [];
  try { const j = await api('/brain/contradictions'); list = j.contradictions || []; } catch {}
  if (!list.length) { body.innerHTML = '<div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 6 5.5l2-5.5 10 7-4.71 2.14M14 18l-5.5 4 2-7-6-3.5 7-1.5L12 2l3.5 6.5 7 1.5-6 3.5 2 7z"/></svg><div class="e-title">No unresolved tensions</div><div>Conflicting claims across your consumed sources will appear here.</div></div>'; return; }

  const wrap = document.createElement('div'); wrap.style.maxWidth = '980px';

  // Summary
  const topics = [...new Set(list.map(t => t.topic).filter(Boolean))];
  const summary = document.createElement('div');
  summary.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card)';
  summary.innerHTML =
    '<div><div class="s-label">Total tensions</div><div class="s-value c-rejected">' + list.length + '</div></div>' +
    '<div><div class="s-label">Topics involved</div><div class="s-value c-active">' + topics.length + '</div></div>' +
    '<div><div class="s-label">Sources</div><div class="s-value">' + [...new Set(list.flatMap(t => [t.source_a, t.source_b].filter(Boolean)))].length + '</div></div>';
  wrap.appendChild(summary);

  // Group by topic
  const byTopic = {};
  list.forEach(t => {
    const topic = t.topic || 'uncategorized';
    (byTopic[topic] = byTopic[topic] || []).push(t);
  });

  Object.entries(byTopic).forEach(([topic, tensions]) => {
    const topicSection = document.createElement('div');
    topicSection.style.marginBottom = '24px';
    const tHeader = document.createElement('div');
    tHeader.className = 'sec-title';
    tHeader.innerHTML = esc(topic) + ' <span class="count">' + tensions.length + '</span>';
    topicSection.appendChild(tHeader);

    tensions.forEach(t => {
      const c = document.createElement('div');
      c.className = 'tension-card';
      c.style.cssText = 'display:grid;grid-template-columns:1fr auto 1fr auto;gap:16px;align-items:start;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);margin-bottom:12px';
      c.innerHTML =
        '<div><div class="t-source" style="font-weight:600;font-size:13px">' + esc(t.source_a || '\u2014') + '</div><div class="t-meta" style="font-size:11px;color:var(--ink-3);margin-top:2px">Source A</div></div>' +
        '<div class="tension-vs" style="font-weight:600;color:var(--rejected);font-size:14px;display:flex;align-items:center;height:100%">vs</div>' +
        '<div><div class="t-source" style="font-weight:600;font-size:13px">' + esc(t.source_b || '\u2014') + '</div><div class="t-meta" style="font-size:11px;color:var(--ink-3);margin-top:2px">Source B</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:6px">' +
        '<button class="btn btn-sm btn-ghost" data-resolve="' + esc(t.id) + '" style="justify-self:end">Resolve</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="view" data-id="' + esc(t.id) + '" style="justify-self:end">Details</button>' +
        '</div>' +
        '<div class="tension-body" style="grid-column:1/-1;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:13px;color:var(--ink-2)"><span class="tension-topic" style="font-weight:600;color:var(--ink)">' + esc(t.topic || 'unclear') + '</span> \u2014 ' + esc(t.tension || '') + '</div>';
      topicSection.appendChild(c);
    });
    wrap.appendChild(topicSection);
  });

  body.innerHTML = '';
  body.appendChild(wrap);

  body.onclick = async (e) => {
    const resolveBtn = e.target.closest('[data-resolve]');
    if (resolveBtn) {
      try {
        await api('/brain/contradiction/resolve', { method: 'POST', body: JSON.stringify({ id: resolveBtn.dataset.resolve }) });
        toast('Resolved');
        VIEWS['map.tensions'](body);
      } catch (e2) { toast('Failed: ' + e2.message, true); }
      return;
    }
    const viewBtn = e.target.closest('[data-action="view"]');
    if (viewBtn) {
      const t = list.find(x => x.id === viewBtn.dataset.id);
      if (!t) return;
      const c = document.createElement('div');
      c.innerHTML =
        '<div style="margin-bottom:16px"><h3 style="margin-bottom:8px">' + esc(t.topic || 'Unclear') + '</h3></div>' +
        '<div class="sec-title" style="margin-bottom:8px">Tension</div>' +
        '<div class="muted" style="margin-bottom:16px;line-height:1.6">' + esc(t.tension || 'No details') + '</div>' +
        '<div class="sec-title" style="margin-bottom:8px">Sources</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' +
        '<div><div class="s-label">Source A</div><div style="font-weight:600">' + esc(t.source_a || '\u2014') + '</div></div>' +
        '<div><div class="s-label">Source B</div><div style="font-weight:600">' + esc(t.source_b || '\u2014') + '</div></div>' +
        '</div>' +
        (t.claim_a ? '<div class="sec-title" style="margin-bottom:8px">Claim A</div><div class="muted" style="margin-bottom:16px;line-height:1.6">' + esc(t.claim_a) + '</div>' : '') +
        (t.claim_b ? '<div class="sec-title" style="margin-bottom:8px">Claim B</div><div class="muted" style="margin-bottom:16px;line-height:1.6">' + esc(t.claim_b) + '</div>' : '') +
        (t.resolution_note ? '<div class="sec-title" style="margin-bottom:8px">Resolution note</div><div class="muted" style="line-height:1.6">' + esc(t.resolution_note) + '</div>' : '');
      openModal(c, true);
    }
  };
};

// feature 15: mega composer
VIEWS['map.mega'] = (body) => {
  const P = state.brain.profile && state.brain.profile.profile;
  const pri = (state.brain.profile && state.brain.profile.priorities) || [];
  const patterns = (state.brain.profile && state.brain.profile.patterns) || [];
  const wrap = document.createElement('div');
  wrap.style.maxWidth = '760px';

  // Section 1: Core filter with smart suggestions
  const sec1 = document.createElement('div'); sec1.className = 'mega-section';
  sec1.innerHTML = '<h3>Core filter</h3>';
  const ta = document.createElement('textarea'); ta.className = 'mega-textarea';
  ta.value = (P && (P.core_filter || P.identity_json)) || '';
  ta.placeholder = 'Describe your core filter for evaluating content. This guides what gets recommended...';
  const autoResize = () => { ta.style.height = 'auto'; ta.style.height = Math.max(140, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', autoResize);
  setTimeout(autoResize, 10);
  sec1.appendChild(ta);

  // Smart suggestions based on profile
  if (patterns.length) {
    const sugg = document.createElement('div');
    sugg.style.cssText = 'margin-top:12px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card)';
    sugg.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">Suggested additions from your patterns</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
      patterns.slice(0, 5).map(p =>
        '<button class="btn btn-sm btn-ghost" data-suggest="' + esc(p.description.slice(0, 60)) + '" style="font-size:11px">' + esc(p.description.slice(0, 50)) + (p.description.length > 50 ? '\u2026' : '') + '</button>'
      ).join('') +
      '</div>';
    sec1.appendChild(sugg);
    sugg.onclick = (e) => {
      const btn = e.target.closest('[data-suggest]');
      if (btn) {
        const text = btn.dataset.suggest;
        if (!ta.value.includes(text)) {
          ta.value += (ta.value ? '\\n\\n' : '') + text;
          autoResize();
        }
      }
    };
  }

  const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-primary'; saveBtn.style.marginTop = '8px'; saveBtn.textContent = 'Save filter';
  saveBtn.onclick = async () => {
    try { await api('/brain/profile', { method: 'POST', body: JSON.stringify({ core_filter: ta.value }) }); toast('Saved'); await loadBrain(); } catch (e) { toast('Failed: ' + e.message, true); }
  };
  sec1.appendChild(saveBtn);
  wrap.appendChild(sec1);

  // Section 2: Priority order with branch info
  const sec2 = document.createElement('div'); sec2.className = 'mega-section';
  sec2.innerHTML = '<h3>Priority order <span class="count" id="pri-count">' + pri.length + '</span></h3>';
  const list = document.createElement('div'); list.id = 'pri-list';
  pri.forEach((p, i) => {
    const branch = (state.brain.tree && state.brain.tree.nodes) ? state.brain.tree.nodes.find(n => n.id === p.branch_id) : null;
    const row = document.createElement('div'); row.className = 'pri-row'; row.draggable = true; row.dataset.idx = String(i);
    row.innerHTML = '<span class="pri-handle" title="Drag to reorder">\u22EE\u22EE</span><span class="pri-rank">#' + (i + 1) + '</span><span class="pri-id">' + esc(p.branch_id) + '</span><span style="font-size:12px;color:var(--ink-2)">' + esc(p.label || (branch ? branch.label : '')) + '</span><span class="pri-status" style="margin-left:auto;font-size:10px;color:var(--ink-3)">' + (branch ? (branch.type || 'branch') : '\u2014') + '</span>';
    list.appendChild(row);
  });
  sec2.appendChild(list);
  const saveP = document.createElement('button'); saveP.className = 'btn btn-primary'; saveP.style.marginTop = '8px'; saveP.textContent = 'Save order';
  saveP.onclick = async () => {
    const items = $$('.pri-row', list).map(r => ({ rank: parseInt(r.querySelector('.pri-rank').textContent.slice(1)), branch_id: r.querySelector('.pri-id').textContent, label: r.children[3].textContent }));
    try { await api('/brain/priorities', { method: 'POST', body: JSON.stringify(items) }); toast('Priorities saved'); await loadBrain(); } catch (e) { toast('Failed: ' + e.message, true); }
  };
  sec2.appendChild(saveP);
  wrap.appendChild(sec2);

  // Section 3: Patterns overview (read-only summary)
  if (patterns.length) {
    const sec3 = document.createElement('div'); sec3.className = 'mega-section';
    sec3.innerHTML = '<h3>Detected patterns <span class="count">' + patterns.length + '</span></h3>';
    const patWrap = document.createElement('div');
    patWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    patterns.slice(0, 8).forEach(p => {
      const el = document.createElement('div');
      el.style.cssText = 'padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-ctl);font-size:12px;line-height:1.5';
      el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span class="strength-tag strength-' + esc(p.strength || 'confirmed') + '" style="font-size:10px;padding:2px 6px">' + esc(p.strength || 'confirmed') + '</span><span class="mono dim" style="font-size:10px">' + esc(p.id) + '</span></div><div style="color:var(--ink-2)">' + esc(p.description) + '</div>';
      patWrap.appendChild(el);
    });
    sec3.appendChild(patWrap);
    wrap.appendChild(sec3);
  }

  body.appendChild(wrap);

  // Drag and drop for priority reordering
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

  // topic filter state
  const activeTopic = state.topicFilter;

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
    (todayEntry.topics ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + todayEntry.topics.split(',').filter(x => x.trim()).map(x => '<span class="chip' + (activeTopic === x.trim() ? ' topic-filter-active' : '') + '" data-topic="' + esc(x.trim()) + '" style="cursor:pointer">' + esc(x.trim()) + '</span>').join('') + '</div>' : '<div class="muted" style="font-size:12px">No topics logged today</div>') +
    (todayRecs.length ? '<div class="digest-section"><div class="digest-section-title">Consumed today</div>' + todayRecs.slice(0, 3).map(r => '<div class="digest-item"><span class="dot dot-consumed"></span><a href="' + esc(r.video_url) + '" target="_blank" rel="noopener">' + esc(r.video_title) + '</a></div>').join('') + '</div>' : '') +
    (todayVault.length ? '<div class="digest-section"><div class="digest-section-title">Produced today</div>' + todayVault.slice(0, 3).map(v => '<div class="digest-item"><span class="dot dot-active"></span><a href="/html/download/' + esc(v.id) + '" target="_blank" rel="noopener">' + esc(v.filename) + '</a></div>').join('') + '</div>' : '');
  wrap.appendChild(digest);

  // Topic filter toggle
  if (activeTopic) {
    const filterBar = document.createElement('div');
    filterBar.className = 'topic-filter-bar';
    filterBar.innerHTML = '<span class="topic-filter-label">Filtered by:</span><span class="chip topic-filter-active">' + esc(activeTopic) + ' <span style="cursor:pointer;margin-left:4px" data-clear-topic>\xD7</span></span>';
    wrap.appendChild(filterBar);
  }

  // Week summary line
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartKey = weekStart.toISOString().split('T')[0];
  const weekItems = state.recs.filter(r => r.status === 'consumed' && (r.consumed_date || '').slice(0, 10) >= weekStartKey);
  const weekVault = state.vault.filter(v => (v.created_at || '').slice(0, 10) >= weekStartKey);
  const weekSummary = document.createElement('div');
  weekSummary.className = 'week-summary';
  weekSummary.innerHTML = '<span class="week-summary-label">This week</span><span>' + weekItems.length + ' items consumed</span><span>' + weekVault.length + ' vault items produced</span>';
  wrap.appendChild(weekSummary);

  // Recent vault items (last 3 days)
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysKey = threeDaysAgo.toISOString().split('T')[0];
  const recentVault = state.vault.filter(v => (v.created_at || '').slice(0, 10) >= threeDaysKey);
  if (recentVault.length) {
    const vaultRow = document.createElement('div');
    vaultRow.className = 'vault-recent';
    vaultRow.innerHTML = '<div class="sec-title">Recent vault <span class="count">' + recentVault.length + '</span></div>';
    const vaultList = document.createElement('div');
    vaultList.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    recentVault.slice(0, 6).forEach(v => {
      const tag = document.createElement('a');
      tag.className = 'chip chip-accent';
      tag.href = '/html/download/' + esc(v.id);
      tag.target = '_blank';
      tag.rel = 'noopener';
      tag.textContent = v.filename.replace(/[.]\\w+$/, '');
      vaultList.appendChild(tag);
    });
    vaultRow.appendChild(vaultList);
    wrap.appendChild(vaultRow);
  }

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

  // Streak nudge: if today has 0 items, show motivational reminder
  if (todayEntry.count === 0 && curStreak > 0) {
    const nudge = document.createElement('div');
    nudge.className = 'streak-nudge';
    nudge.innerHTML = '<div class="streak-nudge-text">Keep the streak alive! <span class="mono">' + curStreak + ' day' + (curStreak === 1 ? '' : 's') + '</span> and counting.</div><div class="streak-nudge-sub">Log something today to keep it going.</div>';
    wrap.appendChild(nudge);
  }

  const stats = document.createElement('div');
  stats.className = 'stat-grid';
  stats.innerHTML =
    '<div class="stat-block"><div class="s-label">Total items</div><div class="s-value c-consumed">' + total + '</div><div class="s-sub">this year</div></div>' +
    '<div class="stat-block stat-streak' + (curStreak >= 7 ? ' streak-hot' : '') + '"><div class="s-label">' + (curStreak >= 7 ? '\u2615 ' : '') + 'Current streak</div><div class="s-value c-active">' + curStreak + '</div><div class="s-sub">' + (curStreak >= 7 ? '\u{1F525} ' + curStreak + ' day fire' : curStreak + ' day' + (curStreak === 1 ? '' : 's')) + '</div></div>' +
    '<div class="stat-block"><div class="s-label">Best streak</div><div class="s-value c-accent">' + bestStreak + '</div><div class="s-sub">days</div></div>' +
    '<div class="stat-block"><div class="s-label">Active days</div><div class="s-value">' + activeDays + '</div><div class="s-sub">of 365</div></div>';
  wrap.appendChild(stats);

  // Heatmap with range toggle
  const hmRange = state.heatmapRange;
  let hmStart;
  if (hmRange === '6M') { hmStart = new Date(); hmStart.setMonth(hmStart.getMonth() - 6); }
  else if (hmRange === '1Y') { hmStart = new Date(); hmStart.setFullYear(hmStart.getFullYear() - 1); }
  else { hmStart = new Date(yearAgo); }

  const hmWrap = document.createElement('div');
  hmWrap.className = 'heatmap-wrap';

  // Range toggle
  const hmControls = document.createElement('div');
  hmControls.className = 'heatmap-controls';
  ['6M', '1Y', 'All'].forEach(r => {
    const btn = document.createElement('button');
    btn.className = 'seg-btn' + (hmRange === r ? ' active' : '');
    btn.textContent = r;
    btn.onclick = () => { state.heatmapRange = r; renderBody(); };
    hmControls.appendChild(btn);
  });
  hmWrap.appendChild(hmControls);

  // Build weeks for the selected range
  const hmDates = [];
  for (let d = new Date(hmStart); d <= today2; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    const c = (map[key] && map[key].count) || 0;
    hmDates.push({ date: key, count: c });
  }
  const hmWeeks = [];
  let hmWeek = [];
  const hmStartDay = hmStart.getDay();
  for (let i = 0; i < hmStartDay; i++) hmWeek.push(null);
  hmDates.forEach(d => {
    hmWeek.push(d);
    if (hmWeek.length === 7) { hmWeeks.push(hmWeek); hmWeek = []; }
  });
  if (hmWeek.length) hmWeeks.push(hmWeek);

  const hmInner = document.createElement('div');
  hmInner.style.cssText = 'position:relative;display:inline-block;padding-left:24px';
  const monthLabels = document.createElement('div');
  monthLabels.className = 'heatmap-months';
  let lastMonth = '';
  hmWeeks.forEach(w => { const first = w.find(d => d); const m = first ? first.date.slice(5,7) : ''; monthLabels.innerHTML += '<span>' + (m !== lastMonth ? ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)] || '' : '') + '</span>'; lastMonth = m; });
  hmInner.appendChild(monthLabels);
  const hm = document.createElement('div');
  hm.className = 'heatmap';
  hmWeeks.forEach(w => {
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
        const topics = map[day.date] ? (map[day.date].topics || '') : '';
        cell.title = day.date + ' \u2014 ' + c + ' item' + (c === 1 ? '' : 's') + (topics ? ' \xB7 ' + topics : '');
        if (c > 0) cell.onclick = () => openDayModal(day.date);
      }
      col.appendChild(cell);
    });
    hm.appendChild(col);
  });
  hmInner.appendChild(hm);
  hmWrap.appendChild(hmInner);

  // Heatmap legend
  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.innerHTML = '<span>Less</span><span class="hm-legend-cell"></span><span class="hm-legend-cell l1"></span><span class="hm-legend-cell l2"></span><span class="hm-legend-cell l3"></span><span class="hm-legend-cell l4"></span><span>More</span>';
  hmWrap.appendChild(legend);

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
    if (activeTopic && !entry.topics.split(',').some(x => x.trim() === activeTopic)) continue;
    hasRecent = true;
    const el = document.createElement('div');
    el.className = 'archive-item';
    const topics = (entry.topics || '').split(',').filter(x => x.trim()).map(x => '<span class="chip' + (activeTopic === x.trim() ? ' topic-filter-active' : '') + '" data-topic="' + esc(x.trim()) + '" style="cursor:pointer">' + esc(x.trim()) + '</span>').join(' ');
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

  // Activity Feed
  if (state.updateLog.length) {
    const feedTitle = document.createElement('div');
    feedTitle.className = 'sec-title';
    feedTitle.innerHTML = 'Activity <span class="count">' + state.updateLog.length + '</span>';
    wrap.appendChild(feedTitle);
    const feed = document.createElement('div');
    feed.className = 'activity-feed';
    state.updateLog.slice(0, 20).forEach(ev => {
      const entry = document.createElement('div');
      entry.className = 'activity-entry';
      const kindClass = 'activity-kind-' + (ev.kind || 'system');
      const kindLabel = ev.kind || 'system';
      entry.innerHTML =
        '<span class="activity-dot ' + kindClass + '"></span>' +
        '<span class="activity-time">' + esc(age(ev.ts)) + '</span>' +
        '<span class="activity-kind ' + kindClass + '">' + esc(kindLabel) + '</span>' +
        '<span class="activity-summary">' + esc(ev.summary) + '</span>';
      if (ev.details_json) {
        const detailsBtn = document.createElement('button');
        detailsBtn.className = 'btn btn-ghost btn-sm activity-toggle';
        detailsBtn.textContent = 'Details';
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'activity-details';
        detailsDiv.style.display = 'none';
        try {
          const parsed = JSON.parse(ev.details_json);
          detailsDiv.textContent = JSON.stringify(parsed, null, 2);
        } catch {
          detailsDiv.textContent = ev.details_json;
        }
        detailsBtn.onclick = () => {
          const isVisible = detailsDiv.style.display !== 'none';
          detailsDiv.style.display = isVisible ? 'none' : 'block';
          detailsBtn.textContent = isVisible ? 'Details' : 'Hide';
        };
        entry.appendChild(detailsBtn);
        entry.appendChild(detailsDiv);
      }
      feed.appendChild(entry);
    });
    wrap.appendChild(feed);
  }

  // Topic chip click delegation
  wrap.onclick = (e) => {
    const chip = e.target.closest('[data-topic]');
    if (chip) {
      const topic = chip.dataset.topic;
      state.topicFilter = state.topicFilter === topic ? '' : topic;
      renderBody();
      return;
    }
    const clearBtn = e.target.closest('[data-clear-topic]');
    if (clearBtn) {
      state.topicFilter = '';
      renderBody();
    }
  };

  body.appendChild(wrap);
};

async function openDayModal(date) {
  try {
    const j = await api('/learning/detail?date=' + date);
    const day = (j.days || []).find(d => d.date === date);
    const dayRecs = state.recs.filter(r => r.status === 'consumed' && (r.consumed_date || '').slice(0, 10) === date);
    const c = document.createElement('div');
    let html = '<h2 style="margin-bottom:12px">' + esc(fmtDate(date)) + '</h2>' +
      '<div class="muted" style="margin-bottom:12px">' + (day ? day.count : 0) + ' item' + (day && day.count > 1 ? 's' : '') + ' logged</div>';
    if (day && day.topics) {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">' + day.topics.split(',').filter(x => x.trim()).map(x => '<span class="chip">' + esc(x.trim()) + '</span>').join('') + '</div>';
    } else {
      html += '<div class="dim" style="margin-bottom:16px">No topics recorded.</div>';
    }
    if (dayRecs.length) {
      html += '<div class="sec-title">Consumed that day <span class="count">' + dayRecs.length + '</span></div>';
      dayRecs.forEach(r => {
        const rating = (r.user_rating && r.user_rating !== 'unset') ? '<span class="rating-tag rating-' + esc(r.user_rating) + '">' + esc(r.user_rating) + '</span>' : '';
        html += '<div class="archive-item" style="padding:8px 0"><span class="dot dot-consumed" style="margin-top:6px"></span>' +
          '<div style="flex:1;min-width:0"><div class="a-title" style="font-size:13px"><a href="' + esc(r.video_url) + '" target="_blank" rel="noopener">' + esc(r.video_title) + '</a></div>' +
          '<div class="a-meta">' + esc(r.creator || '') + (r.content_type ? ' \xB7 ' + esc(r.content_type) : '') + '</div>' +
          (r.user_review ? '<div class="a-review">' + esc(r.user_review) + '</div>' : '') +
          '</div><div>' + rating + '</div></div>';
      });
    }
    c.innerHTML = html;
    openModal(c);
  } catch { toast('Failed to load day', true); }
}

VIEWS['vault.files'] = (body) => {
  const q = state.search.toLowerCase();
  let files = state.vault;
  if (q) files = files.filter(f => f.filename.toLowerCase().includes(q));
  if (!files.length) {
    body.innerHTML = '<div class="vault-head"><div class="vault-title">Vault</div></div><div class="empty"><svg class="empty-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><div class="e-title">Vault is empty</div><div>Upload HTML artifacts or PDFs \u2014 they will show up here, paired by name.</div><button class="btn btn-primary" onclick="window.__up()">Upload file</button></div>';
    window.__up = openUploadSheet;
    return;
  }
  // Group files by base name (paired HTML+PDF under one card)
  const groups = {};
  files.forEach(f => {
    // Split extension safely without regex backslash issues
    const dotIdx = f.filename.lastIndexOf('.');
    const ext = dotIdx > 0 ? f.filename.slice(dotIdx + 1).toLowerCase() : '';
    const base = dotIdx > 0 ? f.filename.slice(0, dotIdx) : f.filename;
    const pairBase = base;
    (groups[pairBase] = groups[pairBase] || {});
    if (ext === 'html' || ext === 'htm') {
      if (!groups[pairBase].html || f.created_at > groups[pairBase].html.created_at) groups[pairBase].html = f;
    } else if (ext === 'pdf') {
      if (!groups[pairBase].pdf || f.created_at > groups[pairBase].pdf.created_at) groups[pairBase].pdf = f;
    } else if (ext === 'md' || ext === 'markdown') {
      groups[pairBase].md = f;
    } else {
      (groups[pairBase].other = groups[pairBase].other || []).push(f);
    }
  });

  // Helpers
  function iconType(g) {
    if (g.md) return 'md';
    if (g.html) return 'code';
    if (g.pdf) return 'pdf';
    return 'file';
  }
  function getDesc(g, base) {
    const src = g.html || g.md;
    if (src && src.snippet && !src.filename.endsWith('.pdf')) {
      let t = src.snippet.replace(/<[^>]*>/g, '').trim();
      // Skip if snippet looks like base64 (PDF content)
      if (t.length > 10 && !/^[A-Za-z0-9+/=]{40,}$/.test(t.slice(0, 60))) {
        t = t.slice(0, 300).replace(/ +/g, ' ');
        return t.length > 120 ? t.slice(0, 117) + '...' : t;
      }
    }
    // Fallback: humanize the filename (no backslash-reliant regex)
    return base.replace(/[-_]/g, ' ').split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
  }
  function getTags(g) {
    const tags = [];
    if (g.pdf) tags.push('PDF');
    if (g.html) tags.push('HTML');
    if (g.md) tags.push('Markdown');
    return tags;
  }

  // Header with toggle
  const head = document.createElement('div');
  head.className = 'vault-head';
  head.innerHTML =
    '<div class="vault-title">Vault</div>' +
    '<div class="vault-toggle">' +
    '<button class="vault-toggle-btn' + (state.vaultView === 'grid' ? ' active' : '') + '" data-view="grid">' +
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>Grid</button>' +
    '<button class="vault-toggle-btn' + (state.vaultView === 'list' ? ' active' : '') + '" data-view="list">' +
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="3" x2="14" y2="3"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="13" x2="14" y2="13"/></svg>List</button>' +
    '</div>';
  body.appendChild(head);
  head.querySelectorAll('.vault-toggle-btn').forEach(btn => {
    btn.onclick = () => { state.vaultView = btn.dataset.view; renderBody(); };
  });

  if (state.vaultView === 'grid') {
    const grid = document.createElement('div');
    grid.className = 'vault-grid';
    let idx = 0;
    Object.entries(groups).forEach(([base, g]) => {
      const type = iconType(g);
      const desc = getDesc(g, base);
      const tags = getTags(g);
      const card = document.createElement('div');
      card.className = 'vault-card';
      card.style.animationDelay = (idx * 25) + 'ms';
      idx++;
      const tagsHtml = tags.map(t => '<span class="vault-card-tag">' + esc(t) + '</span>').join('');
      // Download links
      let dlHtml = '';
      if (g.html) dlHtml += '<a class="vault-card-download" href="/html/download/' + esc(g.html.id) + '" target="_blank" rel="noopener">HTML</a> ';
      if (g.pdf) dlHtml += '<a class="vault-card-download" href="/html/download/' + esc(g.pdf.id) + '" target="_blank" rel="noopener">PDF</a>';
      card.innerHTML =
        '<div class="vault-card-icon ' + type + '">' + (type === 'md' ? 'Md' : type === 'pdf' ? 'Pdf' : 'Code') + '</div>' +
        '<div class="vault-card-name">' + esc(base) + '</div>' +
        '<div class="vault-card-desc">' + esc(desc) + '</div>' +
        (g.html ? '<div class="vault-card-preview" data-id="' + esc(g.html.id) + '"></div>' : '') +
        '<div class="vault-card-foot">' +
        '<div class="vault-card-tags">' + tagsHtml + '</div>' +
        '<button class="vault-card-read" data-base="' + esc(base) + '">Mark read</button>' +
        '<button class="vault-card-del" data-base="' + esc(base) + '">Delete</button>' +
        '</div>';
      grid.appendChild(card);
      // Load preview iframe on hover
      if (g.html) {
        card.addEventListener('mouseenter', () => {
          const preview = card.querySelector('.vault-card-preview');
          if (preview && !preview.querySelector('iframe')) {
            const iframe = document.createElement('iframe');
            iframe.src = '/html/download/' + g.html.id;
            iframe.loading = 'lazy';
            iframe.sandbox = 'allow-same-origin';
            preview.appendChild(iframe);
          }
        });
      }
    });
    body.appendChild(grid);
  } else {
    // List view
    const list = document.createElement('div');
    list.className = 'vault-list-wrap';
    Object.entries(groups).forEach(([base, g]) => {
      const row = document.createElement('div');
      row.className = 'vault-list-row';
      const date = (g.html && g.html.created_at) || (g.pdf && g.pdf.created_at) || (g.md && g.md.created_at) || '';
      let actsHtml = '';
      if (g.pdf) actsHtml += '<a class="btn btn-sm" href="/html/download/' + esc(g.pdf.id) + '" target="_blank" rel="noopener">PDF</a>';
      else actsHtml += '<span class="btn btn-sm btn-disabled">PDF</span>';
      if (g.html) actsHtml += '<a class="btn btn-sm" href="/html/download/' + esc(g.html.id) + '" target="_blank" rel="noopener">HTML</a>';
      else actsHtml += '<span class="btn btn-sm btn-disabled">HTML</span>';
      actsHtml += '<button class="btn btn-sm btn-ghost vault-card-read" data-base="' + esc(base) + '">Read</button>';
      actsHtml += '<button class="btn btn-sm btn-ghost btn-danger vault-card-del" data-base="' + esc(base) + '">Delete</button>';
      row.innerHTML =
        '<div><div class="vault-list-name">' + esc(base) + '</div><div class="vault-list-meta">' + esc(fmtDate(date)) + '</div></div>' +
        '<div class="vault-list-actions">' + actsHtml + '</div>';
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  // Delete with confirmation + undo
  const doDelete = async (base) => {
    const g = groups[base];
    if (!g) return;
    const toDelete = [];
    if (g.html) toDelete.push(g.html.id);
    if (g.pdf) toDelete.push(g.pdf.id);
    if (g.md) toDelete.push(g.md.id);
    if (!toDelete.length) return;
    try {
      await Promise.all(toDelete.map(id => api('/html/delete', { method: 'POST', body: JSON.stringify({ id, undo: true }) })));
      toastUndo('Deleted ' + base, async () => {
        for (const id of toDelete) {
          try { await api('/html/undo', { method: 'POST', body: JSON.stringify({ id }) }); } catch {}
        }
        await loadVault(); renderSubnav(); renderBody();
      });
      await loadVault(); renderSubnav(); renderBody();
    } catch (e) { toast('Delete failed: ' + e.message, true); }
  };

  // Mark vault item as consumed (read-later loop)
  const doConsumeVault = async (base) => {
    const g = groups[base];
    if (!g) return;
    const file = g.html || g.pdf || g.md;
    if (!file) return;
    try {
      await api('/learning/log', { method: 'POST', body: JSON.stringify({ date: new Date().toISOString().split('T')[0], count: 1, topics: 'vault:' + base }) });
      toast('Logged as consumed: ' + base);
      await loadVault(); renderSubnav(); renderBody();
    } catch (e) { toast('Failed: ' + e.message, true); }
  };
  body.onclick = (e) => {
    const readBtn = e.target.closest('.vault-card-read');
    if (readBtn) {
      e.stopPropagation();
      const base = readBtn.dataset.base;
      if (!confirm('Mark "' + base + '" as consumed?')) return;
      doConsumeVault(base);
      return;
    }
    const delBtn = e.target.closest('.vault-card-del');
    if (!delBtn) return;
    const base = delBtn.dataset.base;
    const g = groups[base];
    if (!g) return;
    const files_ = [];
    if (g.html) files_.push('HTML');
    if (g.pdf) files_.push('PDF');
    if (g.md) files_.push('Markdown');
    const c = document.createElement('div');
    c.innerHTML = '<h2 style="margin-bottom:12px">Delete &laquo;' + esc(base) + '&raquo;?</h2>' +
      '<div class="muted" style="margin-bottom:16px">This will permanently delete the ' + files_.join(' and ') + ' file' + (files_.length > 1 ? 's' : '') + '.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn btn-ghost" id="confirm-cancel">Cancel</button>' +
      '<button class="btn btn-danger" id="confirm-delete">Delete</button></div>';
    openModal(c);
    document.getElementById('confirm-cancel').onclick = closeModal;
    document.getElementById('confirm-delete').onclick = () => { closeModal(); doDelete(base); };
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

  // Top stat grid
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML =
    '<div class="stat-block"><div class="s-label">Total</div><div class="s-value">' + total + '</div><div class="s-sub">all entries</div></div>' +
    '<div class="stat-block"><div class="s-label">Queue</div><div class="s-value c-active">' + active + '</div><div class="s-sub">waiting</div></div>' +
    '<div class="stat-block"><div class="s-label">Consumed</div><div class="s-value c-consumed">' + consumed + '</div><div class="s-sub">' + rate + '% of total</div></div>' +
    '<div class="stat-block"><div class="s-label">Rejected</div><div class="s-value c-rejected">' + rejected + '</div><div class="s-sub">' + Math.round(rejected / Math.max(1, total) * 100) + '%</div></div>';
  wrap.appendChild(grid);

  // ---------- Trend Comparisons ----------
  // Weekly trend: this week vs last week
  const allConsumed = (S.allEntries || []).filter(e => e.status === 'consumed' && e.consumed_date && e.consumed_date !== 'unset');
  const now = new Date();
  const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - now.getDay());
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  const thisWeekCount = allConsumed.filter(e => e.consumed_date >= thisWeekStart.toISOString().split('T')[0]).length;
  const lastWeekCount = allConsumed.filter(e => e.consumed_date >= lastWeekStart.toISOString().split('T')[0] && e.consumed_date < lastWeekEnd.toISOString().split('T')[0]).length;
  const weekPct = lastWeekCount > 0 ? Math.round((thisWeekCount - lastWeekCount) / lastWeekCount * 100) : 0;
  const weekArrow = weekPct > 0 ? '\u2191' : weekPct < 0 ? '\u2193' : '\u2192';
  const weekColor = weekPct > 0 ? 'c-consumed' : weekPct < 0 ? 'c-rejected' : '';

  const trendCard = document.createElement('div');
  trendCard.className = 'trend-card';
  trendCard.innerHTML =
    '<div class="chart-title">Weekly trend</div>' +
    '<div class="trend-row">' +
    '<div class="trend-stat"><div class="trend-label">This week</div><div class="trend-value ' + weekColor + '">' + thisWeekCount + '</div></div>' +
    '<div class="trend-stat"><div class="trend-label">Last week</div><div class="trend-value">' + lastWeekCount + '</div></div>' +
    '<div class="trend-stat"><div class="trend-label">Change</div><div class="trend-value ' + weekColor + '">' + weekArrow + ' ' + Math.abs(weekPct) + '%</div></div>' +
    '</div>';
  wrap.appendChild(trendCard);

  // Monthly average (last 6 months)
  const recentMonths = (S.consumptionByMonth || []).slice(-6);
  const avgMonth = recentMonths.length > 0 ? Math.round(recentMonths.reduce((a, m) => a + m.c, 0) / recentMonths.length) : 0;
  const avgCard = document.createElement('div');
  avgCard.className = 'trend-card';
  avgCard.innerHTML =
    '<div class="chart-title">Monthly average</div>' +
    '<div class="trend-row">' +
    '<div class="trend-stat"><div class="trend-label">6-month avg</div><div class="trend-value">' + avgMonth + '</div></div>' +
    '<div class="trend-stat"><div class="trend-label">Months</div><div class="trend-value">' + recentMonths.length + '</div></div>' +
    '</div>';
  wrap.appendChild(avgCard);

  // Rating by content type
  const contentTypeMap = {};
  allConsumed.forEach(e => {
    const ct = e.content_type || 'unknown';
    contentTypeMap[ct] = (contentTypeMap[ct] || 0) + 1;
  });
  const contentTypeEntries = Object.entries(contentTypeMap).sort((a, b) => b[1] - a[1]);
  if (contentTypeEntries.length) {
    const ctMax = Math.max(...contentTypeEntries.map(([, c]) => c), 1);
    const ctCard = document.createElement('div');
    ctCard.className = 'chart-card';
    ctCard.innerHTML = '<div class="chart-title">Rating by content type</div>';
    const ctBars = document.createElement('div');
    ctBars.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    contentTypeEntries.forEach(([ct, c]) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<span class="b-label">' + esc(ct) + '</span>' +
        '<div class="b-track"><div class="b-fill" style="width:' + Math.round(c / ctMax * 100) + '%"></div></div>' +
        '<span class="b-count">' + c + '</span>';
      ctBars.appendChild(row);
    });
    ctCard.appendChild(ctBars);
    wrap.appendChild(ctCard);
  }

  // Rating distribution chart (horizontal stacked bar)
  if (S.ratingDistribution && S.ratingDistribution.length) {
    const chart = document.createElement('div');
    chart.className = 'chart-card';
    chart.innerHTML = '<div class="chart-title">Rating distribution <span class="count">' + S.ratingDistribution.length + '</span></div>';
    const bar = document.createElement('div');
    bar.className = 'rating-dist';
    const labels = ['love', 'like', 'meh', 'dislike'];
    const vals = {};
    S.ratingDistribution.forEach(r => { vals[r.user_rating?.toLowerCase()] = r.c; });
    const sum = labels.reduce((a, l) => a + (vals[l] || 0), 0);
    if (sum > 0) {
      labels.forEach(l => {
        const c = vals[l] || 0;
        if (c === 0) return;
        const seg = document.createElement('div');
        seg.className = 'rating-seg r-' + l;
        seg.style.width = Math.round(c / sum * 100) + '%';
        seg.textContent = c > 1 ? c : '';
        bar.appendChild(seg);
      });
    }
    chart.appendChild(bar);
    const leg = document.createElement('div');
    leg.style.cssText = 'display:flex;gap:12px;margin-top:8px;font-size:11px;color:var(--ink-2)';
    leg.innerHTML = labels.map(l => '<span style="display:flex;align-items:center;gap:4px"><span class="dot dot-' + l + '" style="width:8px;height:8px;background:var(--' + (l === 'love' ? 'active' : l === 'like' ? 'consumed' : l === 'meh' ? 'ink-3' : 'rejected') + ')"></span>' + l + '</span>').join('');
    chart.appendChild(leg);
    wrap.appendChild(chart);
  }

  // Monthly consumption chart (bars)
  if (S.consumptionByMonth && S.consumptionByMonth.length) {
    const chart = document.createElement('div');
    chart.className = 'chart-card';
    chart.innerHTML = '<div class="chart-title">Consumption by month</div>';
    const max = Math.max(...S.consumptionByMonth.map(m => m.c), 1);
    const bars = document.createElement('div');
    bars.className = 'month-chart';
    S.consumptionByMonth.forEach(m => {
      const b = document.createElement('div');
      b.className = 'month-bar';
      const pct = Math.max(2, Math.round(m.c / max * 100));
      b.style.height = pct + '%';
      b.innerHTML = '<span class="mb-val">' + m.c + '</span><span class="mb-label">' + esc(m.m) + '</span>';
      bars.appendChild(b);
    });
    chart.appendChild(bars);
    wrap.appendChild(chart);
  }

  // Top creators
  if (S.topCreators && S.topCreators.length) {
    const chart = document.createElement('div');
    chart.className = 'chart-card';
    chart.innerHTML = '<div class="chart-title">Top creators <span class="count">' + S.topCreators.length + '</span></div>';
    const max = Math.max(...S.topCreators.map(c => c.c), 1);
    S.topCreators.slice(0, 10).forEach(cr => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<span class="b-label">' + esc(cr.creator) + '</span>' +
        '<div class="b-track"><div class="b-fill" style="width:' + Math.round(cr.c / max * 100) + '%"></div></div>' +
        '<span class="b-count">' + cr.c + '</span>';
      chart.appendChild(row);
    });
    wrap.appendChild(chart);
  }

  // Bundles
  if (S.bundles && S.bundles.length) {
    const chart = document.createElement('div');
    chart.className = 'chart-card';
    chart.innerHTML = '<div class="chart-title">Synergy bundles <span class="count">' + S.bundles.length + '</span></div>';
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    S.bundles.forEach(b => {
      const c = document.createElement('span');
      c.className = 'chip chip-accent';
      c.textContent = b.synergy_bundle_id + ' \xD7' + b.c;
      chips.appendChild(c);
    });
    chart.appendChild(chips);
    wrap.appendChild(chart);
  }

  // Weekly digest
  if (S.weeklyDigest) {
    const chart = document.createElement('div');
    chart.className = 'chart-card';
    const diff = S.weeklyDigest.thisWeek - S.weeklyDigest.lastWeek;
    const trend = diff > 0 ? '\u2191+' + diff : diff < 0 ? '\u2193' + diff : '\u2194';
    chart.innerHTML = '<div class="chart-title">This week <span class="count">' + S.weeklyDigest.thisWeek + '</span></div>' +
      '<div style="font-size:13px">' + trend + ' vs last week (' + S.weeklyDigest.lastWeek + ')</div>' +
      '<div style="margin-top:4px;display:flex;gap:4px;align-items:center">' +
        '<div class="progress-bar" style="flex-grow:1"><div class="progress-fill" style="width:' + Math.min(100, Math.round(S.weeklyDigest.thisWeek / Math.max(S.weeklyDigest.lastWeek, 1) * 100)) + '%"></div></div>' +
      '</div>';
    wrap.appendChild(chart);
  }

  if (S.streak != null) {
    const chart = document.createElement('div');
    chart.className = 'chart-card';
    chart.innerHTML = '<div class="chart-title">Streak <span class="count">' + S.streak + ' days</span></div>' +
      '<div style="font-size:12px;color:var(--ink-2)">Best all-time: ' + (S.streakMaxAllTime || 0) + ' days</div>';
    wrap.appendChild(chart);
  }

  // Rating by creator
  if (S.ratingByCreator && S.ratingByCreator.length) {
    const chart = document.createElement('div');
    chart.className = 'chart-card';
    chart.innerHTML = '<div class="chart-title">Top rated creators <span class="count">' + S.ratingByCreator.length + '</span></div>';
    const maxScore = 10;
    S.ratingByCreator.slice(0, 10).forEach(rc => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<span class="b-label">' + esc(rc.creator) + '</span>' +
        '<div class="b-track"><div class="b-fill" style="width:' + Math.round((rc.avg_score || 0) / maxScore * 100) + '%"></div></div>' +
        '<span class="b-count">' + (rc.avg_score || 0) + ' <span style="font-size:10px;color:var(--ink-2)">(' + rc.total + ')</span></span>';
      chart.appendChild(row);
    });
    wrap.appendChild(chart);
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
document.getElementById('batch-clear').onclick = () => {
  if (!state.selection.size) return;
  const n = state.selection.size;
  if (!confirm('Clear ' + n + ' selected item' + (n === 1 ? '' : 's') + '? This only deselects \u2014 nothing is deleted.')) return;
  state.selection.clear();
  updateBatchBar();
  document.querySelectorAll('.chk').forEach(c => c.checked = false);
  toast('Selection cleared');
};
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

// ---------- FAB (feature 9) \u2014 only visible on curate, mobile-primary ----------
const fab = document.getElementById('fab-new');
if (fab) {
  fab.onclick = openPushSheet;
  const updateFab = () => {
    fab.style.display = (state.ws === 'curate' && window.innerWidth <= 720) ? 'grid' : 'none';
  };
  updateFab();
  window.addEventListener('resize', updateFab);
  // Also update when workspace changes
  const _origSW = setWorkspace;
  window.setWorkspace = function(ws, sub) {
    _origSW(ws, sub);
    updateFab();
  };
}

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
    if (e.key === 'v') return setWorkspace('vault');
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
  if (e.key === 'j') { e.preventDefault(); state.focusedRow = Math.min(cards.length - 1, state.focusedRow + 1); cards.forEach((c, i) => c.classList.toggle('kb-focus', i === state.focusedRow)); }
  else if (e.key === 'k') { e.preventDefault(); state.focusedRow = Math.max(0, state.focusedRow - 1); cards.forEach((c, i) => c.classList.toggle('kb-focus', i === state.focusedRow)); }
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
  const loaders = { recs: loadRecs, brain: loadBrain, learning: loadLearning, vault: loadVault, stats: loadStats, updateLog: loadUpdateLog };
  const needs = {
    curate: ['recs', 'brain'], map: ['brain', 'recs'], log: ['learning', 'vault', 'stats', 'recs', 'updateLog'],
    vault: ['vault'],
  }[ws] || [];
  await Promise.all(needs.map(k => loaders[k]()));
  renderSubnav(); renderBody();
  if (showMsg) toast('Refreshed');
}

const h = location.hash.replace(/^#/, '');
const hash = h.startsWith('/') ? h.slice(1) : h;
const [hw, hs] = hash.split('/');
if (WS[hw]) { state.ws = hw; if (hs && WS[hw].views.some(v => v[0] === hs)) state.sub[hw] = hs; }
else if (!h) { state.ws = 'vault'; state.sub.vault = 'files'; }

$$('.nav-btn[data-ws]').forEach(b => {
  b.onclick = () => setWorkspace(b.dataset.ws);
});

loadRecs().then(() => { initFiltersBar(); if (state.ws === 'curate') { renderSubnav(); renderBody(); } });
loadBrain().then(() => { if (state.ws === 'map') { renderSubnav(); renderBody(); } });
loadLearning().then(() => { if (state.ws === 'log' && state.sub.log === 'journal') renderBody(); });
loadVault().then(() => {
  if (state.ws === 'vault') { renderSubnav(); renderBody(); }
});
loadStats().then(() => { if (state.ws === 'log' && state.sub.log === 'stats') renderBody(); });
loadUpdateLog().then(() => { if (state.ws === 'log' && state.sub.log === 'journal') renderBody(); });

setWorkspace(state.ws, state.sub[state.ws]);

addEventListener('hashchange', function () {
  var h2 = location.hash.replace(/^#/, '');
  var hash2 = h2.startsWith('/') ? h2.slice(1) : h2;
  var _a = hash2.split('/'), ws = _a[0], sub = _a[1];
  if (WS[ws] && (ws !== state.ws || (sub && sub !== state.sub[ws]))) {
    setWorkspace(ws, sub && WS[ws].views.some(function (v) { return v[0] === sub; }) ? sub : WS[ws].views[0][0]);
  }
});
`;

// src/index.ts
var app8 = new Hono2();
var RATE_LIMIT_WINDOW = 6e4;
var RATE_LIMIT_MAX_READS = 100;
var RATE_LIMIT_MAX_WRITES = 20;
var rateLimitStore = /* @__PURE__ */ new Map();
function getClientIp(c) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || c.req.header("cf-connecting-ip") || "unknown";
}
__name(getClientIp, "getClientIp");
function checkRateLimit(ip, isWrite) {
  const now = Date.now();
  const limit = isWrite ? RATE_LIMIT_MAX_WRITES : RATE_LIMIT_MAX_READS;
  const windowMs = RATE_LIMIT_WINDOW;
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { reads: [], writes: [] });
  }
  const entry = rateLimitStore.get(ip);
  const bucket = isWrite ? entry.writes : entry.reads;
  bucket.push(now);
  const recent = bucket.filter((t) => now - t < windowMs);
  bucket.length = 0;
  bucket.push(...recent);
  if (recent.length > limit) {
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - recent[recent.length - limit - 1])) / 1e3) };
  }
  return { allowed: true, retryAfter: 0 };
}
__name(checkRateLimit, "checkRateLimit");
app8.use("/*", async (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  c.res.headers.set("X-Request-Id", requestId);
  await next();
  const duration = Date.now() - start;
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  const status = c.res.status;
  const ua = c.req.header("user-agent") || "-";
  const ip = getClientIp(c);
  console.log(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level: "info", msg: "request", method, path, status, duration, ip, ua, requestId }));
});
app8.use("/*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));
app8.use("/*", async (c, next) => {
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
app8.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") return next();
  const ip = getClientIp(c);
  const { allowed, retryAfter } = checkRateLimit(ip, true);
  if (!allowed) {
    c.res.headers.set("Retry-After", String(retryAfter));
    return c.json({ error: "Rate limit exceeded" }, 429);
  }
  return next();
});
app8.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") {
    const ip = getClientIp(c);
    const { allowed, retryAfter } = checkRateLimit(ip, false);
    if (!allowed) {
      c.res.headers.set("Retry-After", String(retryAfter));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
  }
  await next();
});
app8.use("/*", async (c, next) => {
  const cl = c.req.header("content-length");
  if (cl && Number(cl) > 10 * 1024 * 1024) {
    return c.json({ error: "Payload too large" }, 413);
  }
  await next();
});
app8.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") return next();
  const token = c.req.header("x-api-token") || c.req.query("token");
  const expected = c.env.API_TOKEN;
  if (expected && token !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});
app8.use("/*", (c, next) => {
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  return next();
});
app8.route("/recommendations", recommendations_default);
app8.route("/brain", brain_default);
app8.route("/html", vault_default);
app8.route("/learning", learning_default);
app8.route("/stats", stats_default);
app8.route("/search", search_default);
app8.route("/ai", enhance_default);
app8.get("/health", (c) => c.json({ ok: true, now: (/* @__PURE__ */ new Date()).toISOString() }));
app8.get("/", (c) => c.html(htmlShell));
app8.get("/ui", (c) => c.html(htmlShell));
app8.get("/static/app.css", (c) => {
  c.header("Content-Type", "text/css; charset=utf-8");
  c.header("Cache-Control", "public, max-age=600, must-revalidate");
  return c.body(cssBundle);
});
app8.get("/static/app.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=600, must-revalidate");
  return c.body(jsBundle);
});
app8.get("/manifest.json", (c) => {
  c.header("Content-Type", "application/manifest+json; charset=utf-8");
  c.header("Cache-Control", "public, max-age=86400");
  return c.json({
    name: "Taste Map",
    short_name: "Taste Map",
    start_url: "/",
    display: "standalone",
    background_color: "#242938",
    theme_color: "#0d9182",
    description: "Personal knowledge curation system",
    icons: [{ src: "/static/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/static/icon-512.png", sizes: "512x512", type: "image/png" }],
    share_target: {
      action: "/api/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url" }
    }
  });
});
app8.get("/sw.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=86400");
  c.header("Service-Worker-Allowed", "/");
  return c.body(`
const CACHE = 'tastemap-v1'
const SHELL = ['/','/static/app.css','/static/app.js','https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js']
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic' && !e.request.url.includes('/api/') && !e.request.url.includes('/recommendations/')) {
      const clone = res.clone()
      caches.open(CACHE).then(c => c.put(e.request, clone))
    }
    return res
  }).catch(() => caches.match('/'))))
})
`);
});
app8.post("/api/share-target", async (c) => {
  const { DB } = c.env;
  try {
    const form = await c.req.formData();
    const title = form.get("title")?.toString()?.trim();
    const text = form.get("text")?.toString()?.trim();
    const url = form.get("url")?.toString()?.trim();
    const candidateUrl = url || text;
    if (!candidateUrl || !isValidUrl(candidateUrl)) {
      return c.html('<html><head><meta http-equiv="refresh" content="0;url=/"></head><body>Redirecting\u2026</body></html>');
    }
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const dedup = deriveDedupKey({ video_url: candidateUrl, video_title: title || candidateUrl });
    const vt = title || candidateUrl.split("/").pop()?.replace(/-/g, " ") || "Shared item";
    const ct = candidateUrl.includes("youtube.com") || candidateUrl.includes("youtu.be") ? "video" : candidateUrl.includes("arxiv.org") ? "paper" : "article";
    await DB.prepare(
      `INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'unset', NULL, NULL, ?, NULL, NULL)
      ON CONFLICT(dedup_key) DO UPDATE SET video_title=excluded.video_title, video_url=excluded.video_url, status='active'`
    ).bind(id, vt, null, ct, candidateUrl, null, (/* @__PURE__ */ new Date()).toISOString().split("T")[0], dedup).run();
  } catch {
  }
  return c.html('<html><head><meta http-equiv="refresh" content="0;url=/"></head><body>Saved. Redirecting\u2026</body></html>');
});
app8.get("/api/yt/:id", async (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  const videoId = c.req.param("id");
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return c.json({ error: "invalid id" }, 400);
  try {
    const html = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { headers: { "User-Agent": "TasteMap/1.0" } });
    if (!html.ok) return c.json({ error: "not found" }, 404);
    const meta = await html.json();
    return c.json({
      title: meta?.title || "",
      creator: meta?.author_name || "",
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      url: normalizeYouTubeUrl(`https://www.youtube.com/watch?v=${videoId}`)
    });
  } catch {
    return c.json({ error: "failed" }, 500);
  }
});
app8.post("/api/telegram", async (c) => {
  const { DB } = c.env;
  const { TELEGRAM_BOT_TOKEN } = c.env;
  if (!TELEGRAM_BOT_TOKEN) return c.json({ ok: false }, 403);
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false }, 400);
  }
  const msg = body?.message;
  if (!msg?.text) return c.json({ ok: true });
  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    const url = urlMatch[0];
    const label = text.replace(url, "").trim();
    const id = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const dedup = deriveDedupKey({ video_url: url, video_title: label || url });
    await DB.prepare(
      `INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
      VALUES (?, ?, NULL, 'article', ?, ?, NULL, 'active', 'unset', NULL, NULL, ?, NULL, NULL)
      ON CONFLICT(dedup_key) DO UPDATE SET status='active'`
    ).bind(id, label || url, url, null, dedup).run();
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `Saved: ${label || url}`, reply_to_message_id: msg.message_id })
    });
  } else if (text === "/queue") {
    const active = await DB.prepare("SELECT video_title, content_type FROM recommendations WHERE status='active' ORDER BY created_at DESC LIMIT 5").all();
    const lines = (active.results || []).map((r) => `\u2022 [${r.content_type || "?"}] ${r.video_title}`);
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.length ? `Queue (${lines.length}):
${lines.join("\n")}` : "Queue is empty." })
    });
  } else {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "Send a link to save it, or /queue to see your list.", reply_to_message_id: msg.message_id })
    });
  }
  return c.json({ ok: true });
});
async function scheduled(event, env, ctx) {
  const { DB } = env;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  try {
    await DB.prepare("DELETE FROM undo_queue WHERE expires_at < datetime('now')").run();
    await DB.prepare("INSERT INTO search_idx(search_idx) VALUES('optimize')").run();
    await DB.prepare("DELETE FROM search_idx WHERE source='rec'").run();
    const allRecs = await DB.prepare("SELECT id, video_title, creator, why_this, user_review FROM recommendations").all();
    for (const r of allRecs.results || []) {
      const text = [r.video_title, r.creator, r.why_this, r.user_review].filter(Boolean).join(" ");
      await DB.prepare("INSERT INTO search_idx(source, ref_id, text) VALUES ('rec', ?, ?)").bind(r.id, text).run();
    }
    const staleBranches = await DB.prepare(`
      SELECT DISTINCT substr(dedup_key, 1, instr(dedup_key || '-', '-') - 1) as branch
      FROM recommendations
      WHERE status = 'consumed'
        AND dedup_key LIKE '%-%'
        AND dedup_key NOT LIKE 'yt-%'
        AND dedup_key NOT LIKE 'book-%'
        AND dedup_key NOT LIKE 'key-%'
      GROUP BY branch
      HAVING MAX(consumed_date) < date('now', '-30 days')
    `).all();
    for (const b of staleBranches.results || []) {
      const branch = b.branch;
      if (!branch) continue;
      const existsResult = await DB.prepare(
        `SELECT id FROM recommendations
         WHERE user_rating IN ('love','like') AND status = 'consumed'
           AND substr(dedup_key, 1, instr(dedup_key || '-', '-') - 1) = ?
         ORDER BY consumed_date DESC LIMIT 1`
      ).bind(branch).all();
      if (!existsResult.results || existsResult.results.length === 0) continue;
      const rec = existsResult.results[0];
      const alreadyActive = await DB.prepare("SELECT id FROM recommendations WHERE dedup_key = (SELECT dedup_key FROM recommendations WHERE id = ?) AND status = 'active'").bind(rec.id).first();
      if (alreadyActive) continue;
      const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const rId = `resurface_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await DB.prepare(
        `INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
        SELECT ?, video_title, creator, content_type, video_url, 'Resurfaced: ' || (SELECT label FROM tree_nodes WHERE id = ? LIMIT 1) || ' needs love', ?, 'active', 'unset', NULL, NULL, dedup_key || '-res', NULL, NULL
        FROM recommendations WHERE id = ?`
      ).bind(rId, branch, now, rec.id).run();
    }
    const dueResurface = await DB.prepare(
      "SELECT recommendation_id FROM resurfacing WHERE due_at <= ? AND resolved_at IS NULL"
    ).bind(today).all();
    for (const dr of dueResurface.results || []) {
      const rec = await DB.prepare("SELECT * FROM recommendations WHERE id = ?").bind(dr.recommendation_id).first();
      if (!rec || rec.status === "active") continue;
      const rId = `rs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await DB.prepare(
        `INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
        SELECT ?, video_title, creator, content_type, video_url, 'Scheduled resurface', ?, 'active', 'unset', NULL, NULL, dedup_key || '-rs', NULL, NULL
        FROM recommendations WHERE id = ?`
      ).bind(rId, today, rec.id).run();
    }
    await DB.prepare(`UPDATE resurfacing SET resolved_at = ? WHERE due_at <= ? AND resolved_at IS NULL`).bind(today, today).run();
  } catch (e) {
    console.error("cron failed", e);
  }
}
__name(scheduled, "scheduled");
var index_default = app8;
export {
  index_default as default,
  scheduled
};
//# sourceMappingURL=index.js.map
