package service

import (
	"fmt"
)

// TODO: add graceful shutdown
func StartServer(port int) error {
	fmt.Println(port)
	return nil
}

type Server struct {
	Port int
}

func (s *Server) Stop() error {
	return nil
}
