package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"time"
)

type ProcessRequest struct {
	TransactionID string  `json:"transactionId"`
	Amount        float64 `json:"amount"`
}

type ProcessResponse struct {
	Processed   bool      `json:"processed"`
	ProcessedAt time.Time `json:"processedAt"`
	Note        string    `json:"note"`
}

func processHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Simulate real downstream work (ledger update, settlement, etc.)
	delay := time.Duration(30+rand.Intn(90)) * time.Millisecond
	time.Sleep(delay)

	resp := ProcessResponse{
		Processed:   true,
		ProcessedAt: time.Now().UTC(),
		Note:        "processed downstream",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func main() {
	http.HandleFunc("/process", processHandler)
	http.HandleFunc("/health", healthHandler)

	port := "8082"
	log.Printf("go-processor listening on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}