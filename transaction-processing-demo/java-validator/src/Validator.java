import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.concurrent.ConcurrentHashMap.KeySetView;

public class Validator {

    private static final KeySetView<String, Boolean> seenTransactionIds = ConcurrentHashMap.newKeySet();
    private static final double MAX_ALLOWED_AMOUNT = 1_000_000.00;
    private static final String GO_PROCESSOR_URL = envOr("GO_PROCESSOR_URL", "http://localhost:8082/process");

    private static final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(envOr("PORT", "8081"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/validate", new ValidateHandler());
        server.createContext("/health", exchange -> {
            byte[] body = "ok".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        });
        server.setExecutor(null);
        server.start();
        System.out.println("java-validator listening on :" + port);
    }

    static class ValidateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, String> fields = parseJsonFlat(requestBody);
            String transactionId = fields.get("transactionId");
            String amountStr = fields.get("amount");

            String reason = null;
            boolean valid = true;

            if (transactionId == null || transactionId.isBlank()) {
                valid = false;
                reason = "missing transactionId";
            } else if (!seenTransactionIds.add(transactionId)) {
                valid = false;
                reason = "duplicate transaction id";
            }

            double amount = 0;
            if (valid) {
                try {
                    amount = Double.parseDouble(amountStr);
                    if (amount <= 0) {
                        valid = false;
                        reason = "amount must be positive";
                    } else if (amount > MAX_ALLOWED_AMOUNT) {
                        valid = false;
                        reason = "amount exceeds maximum allowed";
                    }
                } catch (Exception e) {
                    valid = false;
                    reason = "amount is not a valid number";
                }
            }

            boolean processed = false;
            String processNote = null;

            if (valid) {
                try {
                    processed = callGoProcessor(transactionId, amount);
                    processNote = processed ? "processed downstream" : "downstream processing failed";
                } catch (Exception e) {
                    processNote = "downstream call failed: " + e.getMessage();
                }
            }

            String responseJson = String.format(
                    "{\"valid\":%s,\"reason\":%s,\"processed\":%s,\"note\":%s}",
                    valid,
                    reason == null ? "null" : "\"" + reason + "\"",
                    processed,
                    processNote == null ? "null" : "\"" + processNote + "\""
            );

            byte[] responseBytes = responseJson.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(responseBytes);
            }
        }
    }

    private static boolean callGoProcessor(String transactionId, double amount) throws Exception {
        String body = String.format("{\"transactionId\":\"%s\",\"amount\":%s}", transactionId, amount);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(GO_PROCESSOR_URL))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(5))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return response.statusCode() == 200 && response.body().contains("\"processed\":true");
    }

    private static Map<String, String> parseJsonFlat(String json) {
        Map<String, String> result = new ConcurrentHashMap<>();
        Pattern pattern = Pattern.compile("\"(\\w+)\"\\s*:\\s*(\"([^\"]*)\"|[-0-9.]+)");
        Matcher matcher = pattern.matcher(json);
        while (matcher.find()) {
            String key = matcher.group(1);
            String value = matcher.group(3) != null ? matcher.group(3) : matcher.group(2);
            result.put(key, value);
        }
        return result;
    }

    private static String envOr(String key, String fallback) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? fallback : v;
    }
}