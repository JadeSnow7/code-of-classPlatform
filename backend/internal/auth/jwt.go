package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID   uint   `json:"uid"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func SignToken(secret string, userID uint, username string, role string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ParseToken(secret string, tokenString string) (*Claims, error) {
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	)
	token, err := parser.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
