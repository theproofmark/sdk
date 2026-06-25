package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/proofmark/verify-go"
)

// Example net/http handler using ProofMark Verify
func signupHandler(w http.ResponseWriter, r *http.Request) {
	// Parse form data
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Invalid form data", http.StatusBadRequest)
		return
	}

	// Get the ProofMark Verify token from the form
	token := r.FormValue("pm-verify-response")

	// Create a client with your secret key
	client := proofmarkverify.New(os.Getenv("PMV_SECRET_KEY"))

	// Verify the token
	result, err := client.Verify(r.Context(), token, r.RemoteAddr)
	if err != nil {
		// Network error, HTTP error, or invalid response
		log.Printf("verification error: %v", err)
		http.Error(w, "Verification failed", http.StatusInternalServerError)
		return
	}

	// Check if the user is human (score >= 0.5 for free trial signups)
	if !result.IsHuman(0.5) {
		http.Error(w, "Verification failed: suspicious activity", http.StatusBadRequest)
		return
	}

	// Optional: inspect risk flags for finer-grained decisions
	if contains(result.Flags, "datacenter_ip") {
		log.Printf("warning: signup from datacenter IP")
	}

	// Proceed with signup
	fmt.Fprintf(w, "Welcome! Your score: %.2f\n", result.Score)
}

// Example Gin handler (commented out to avoid dependency):
//
// import "github.com/gin-gonic/gin"
//
// func ginSignupHandler(c *gin.Context) {
//     token := c.PostForm("pm-verify-response")
//     client := proofmarkverify.New(os.Getenv("PMV_SECRET_KEY"))
//     result, err := client.Verify(c.Request.Context(), token, c.ClientIP())
//     if err != nil {
//         c.JSON(500, gin.H{"error": "verification failed"})
//         return
//     }
//     if !result.IsHuman(0.5) {
//         c.JSON(400, gin.H{"error": "verification failed"})
//         return
//     }
//     c.JSON(200, gin.H{"message": "Welcome!", "score": result.Score})
// }

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func main() {
	http.HandleFunc("/signup", signupHandler)

	fmt.Println("Server starting on :8080")
	fmt.Println("Set PMV_SECRET_KEY environment variable before running")
	fmt.Println("For testing, use: PMV_SECRET_KEY=pmvs_test_always_pass")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
