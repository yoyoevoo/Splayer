package com.splayer.app;

import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.RequestBody;
import okhttp3.ResponseBody;

public class DownloaderImpl extends Downloader {

    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0";

    private static DownloaderImpl instance;
    private final OkHttpClient client;

    public static DownloaderImpl getInstance() {
        if (instance == null) {
            instance = new DownloaderImpl();
        }
        return instance;
    }

    private DownloaderImpl() {
        this.client = new OkHttpClient.Builder()
            .readTimeout(30, TimeUnit.SECONDS)
            .connectTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(chain -> {
                okhttp3.Request request = chain.request().newBuilder()
                    .addHeader("Cookie", "CONSENT=YES+cb.20210328-17-p0.en+FX+" + System.currentTimeMillis() + "; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg")
                    .addHeader("Accept-Language", "en-US,en;q=0.9")
                    .addHeader("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .addHeader("X-YouTube-Client-Name", "3")
                    .addHeader("X-YouTube-Client-Version", "17.43.36")
                    .build();
                return chain.proceed(request);
            })
            .build();
    }

    @Override
    public Response execute(Request request) throws IOException, ReCaptchaException {
        final String httpMethod  = request.httpMethod();
        final String url         = request.url();
        final Map<String, List<String>> headers = request.headers();
        final byte[] dataToSend  = request.dataToSend();

        RequestBody requestBody = null;
        if (dataToSend != null) {
            requestBody = RequestBody.create(
                MediaType.parse("application/json"), dataToSend);
        }

        okhttp3.Request.Builder builder = new okhttp3.Request.Builder()
            .method(httpMethod, requestBody)
            .url(url)
            .addHeader("User-Agent", USER_AGENT);

        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            final String name = entry.getKey();
            final List<String> values = entry.getValue();
            if (values.size() > 1) {
                builder.removeHeader(name);
                for (String v : values) builder.addHeader(name, v);
            } else if (values.size() == 1) {
                builder.header(name, values.get(0));
            }
        }

        final okhttp3.Response response = client.newCall(builder.build()).execute();

        if (response.code() == 429) {
            throw new ReCaptchaException("reCaptcha Challenge requested", url);
        }

        final ResponseBody body = response.body();
        String responseBody = body != null ? body.string() : null;
        final String finalUrl = response.request().url().toString();

        return new Response(response.code(), response.message(),
            response.headers().toMultimap(), responseBody, finalUrl);
    }
}
