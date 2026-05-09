package examples;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.proofmark.showad.api.ShowAdApi;

/**
 * Sample Spring Boot app that drops in the showad-spring-boot-starter and
 * gates {@code /premium/**} via configuration.
 *
 * Run with:
 *   SHOWAD_CREATOR_HASH=...  \
 *   SHOWAD_API_KEY=...       \
 *   SHOWAD_REDIRECT_SECRET=... \
 *   ./mvnw spring-boot:run
 */
@SpringBootApplication
public class DemoController {

    public static void main(String[] args) {
        SpringApplication.run(DemoController.class, args);
    }

    @RestController
    @RequestMapping("/premium")
    static class PremiumController {

        private final ShowAdApi showAd;

        PremiumController(ShowAdApi showAd) {
            this.showAd = showAd;
        }

        @GetMapping("/welcome")
        public String welcome() {
            return "Welcome, verified visitor for creator " + showAd.getProperties().getCreatorHash();
        }
    }

    @RestController
    static class PublicController {

        @GetMapping("/")
        public String home() {
            return "Public landing page (no ShowAd verification required).";
        }

        @GetMapping("/health")
        public String health() {
            return "ok";
        }
    }
}
