FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY main.go ./
RUN go build -o processor .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/processor .
EXPOSE 8082
CMD ["./processor"]