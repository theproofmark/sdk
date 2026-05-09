package io.proofmark.showad;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;

import io.proofmark.showad.access.AccessPolicyEvaluator;
import io.proofmark.showad.api.ShowAdApi;
import io.proofmark.showad.cookies.CookieJar;
import io.proofmark.showad.jwt.JwtHelper;
import io.proofmark.showad.url.RedirectUrlBuilder;

/**
 * Auto-configuration entry point. Registers the SDK beans and the
 * {@link ShowAdFilter} when {@code showad.enabled=true}.
 */
@AutoConfiguration(after = WebMvcAutoConfiguration.class)
@EnableConfigurationProperties(ShowAdProperties.class)
@ConditionalOnProperty(prefix = "showad", name = "enabled", havingValue = "true")
public class ShowAdAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public JwtHelper showAdJwtHelper() {
        return new JwtHelper();
    }

    @Bean
    @ConditionalOnMissingBean
    public ShowAdHttpClient showAdHttpClient(ShowAdProperties properties, RestTemplateBuilder restTemplateBuilder) {
        return new DefaultShowAdHttpClient(restTemplateBuilder, properties);
    }

    @Bean
    @ConditionalOnMissingBean
    public CookieJar showAdCookieJar(ShowAdProperties properties, JwtHelper jwtHelper) {
        return new CookieJar(properties, jwtHelper);
    }

    @Bean
    @ConditionalOnMissingBean
    public RedirectUrlBuilder showAdRedirectUrlBuilder(ShowAdProperties properties) {
        return new RedirectUrlBuilder(properties);
    }

    @Bean
    @ConditionalOnMissingBean
    public AccessPolicyEvaluator showAdAccessPolicyEvaluator() {
        return new AccessPolicyEvaluator();
    }

    @Bean
    @ConditionalOnMissingBean
    public ShowAdApi showAdApi(ShowAdProperties properties, ShowAdHttpClient httpClient, JwtHelper jwtHelper) {
        return new ShowAdApi(properties, httpClient, jwtHelper);
    }

    @Bean
    @ConditionalOnMissingBean
    public ShowAdFilter showAdFilter(
        ShowAdProperties properties,
        ShowAdHttpClient httpClient,
        JwtHelper jwtHelper,
        CookieJar cookieJar,
        RedirectUrlBuilder redirectUrlBuilder,
        AccessPolicyEvaluator accessPolicyEvaluator
    ) {
        return new ShowAdFilter(properties, httpClient, jwtHelper, cookieJar, redirectUrlBuilder, accessPolicyEvaluator);
    }

    @Bean
    @ConditionalOnMissingBean(name = "showAdFilterRegistration")
    public FilterRegistrationBean<ShowAdFilter> showAdFilterRegistration(ShowAdFilter filter) {
        FilterRegistrationBean<ShowAdFilter> registration = new FilterRegistrationBean<>(filter);
        registration.addUrlPatterns("/*");
        registration.setName("showAdFilter");
        registration.setOrder(50);
        return registration;
    }
}
