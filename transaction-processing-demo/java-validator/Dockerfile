FROM eclipse-temurin:21-jdk-alpine
WORKDIR /app
COPY src ./src
RUN javac -d out src/Validator.java
EXPOSE 8081
CMD ["java", "-cp", "out", "Validator"]