package auth

import (
	"regexp"

	"golang.org/x/crypto/bcrypt"
)

var (
	passwordLetterRE = regexp.MustCompile(`[A-Za-z]`)
	passwordDigitRE  = regexp.MustCompile(`[0-9]`)
)

func HashPassword(plain string) (string, error) {
	return HashPasswordWithCost(plain, bcrypt.DefaultCost)
}

func HashPasswordWithCost(plain string, cost int) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func VerifyPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

func ValidatePasswordPolicy(plain string) bool {
	if len(plain) < 8 {
		return false
	}
	return passwordLetterRE.MatchString(plain) && passwordDigitRE.MatchString(plain)
}
