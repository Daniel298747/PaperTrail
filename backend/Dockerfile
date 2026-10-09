# syntax=docker/dockerfile:1

# ---- build: compile and package the Spring Boot jar with the Maven wrapper ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY src/ src/
RUN ./mvnw -B -q package -DskipTests && cp target/papertrail-backend.jar /workspace/app.jar

# ---- runtime: JRE only, unprivileged user ----
FROM eclipse-temurin:21-jre
RUN groupadd --system papertrail && useradd --system --gid papertrail --home-dir /app papertrail
WORKDIR /app
COPY --from=build /workspace/app.jar /app/app.jar
USER papertrail
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Duser.timezone=UTC"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
